import path from "node:path";
import { readCompassCalls, recordCompassCall } from "../../shared/compass-calls.js";
import { readIndexStats } from "../../shared/index-stats.js";
import { recordGreenRun } from "../../shared/test-runs.js";
import { NUDGE_MIN_INDEXED_FILES } from "./compass-nudge.js";

// The test-run hook: after a Bash call that ran a test command, point a
// failing run at `lawbook_investigate` (it ranks the code the failing test
// reaches) and record a passing one, so the stop does not re-run the same
// tests on the same code. Advisory context only — never a verdict. Pure string
// parsing plus the bounded call-log tail and the index-stats file the
// Compass-first nudge already reads: no index DB, no git, no spawn.

/** A per-failure-signature investigate hint repeats at most once per this window. */
export const TEST_NUDGE_WINDOW_MS = 60 * 60 * 1000;

/** Call-log entry prefix for an investigate hint; the failure signature follows. */
export const INVESTIGATE_NUDGE_PREFIX = "nudge:investigate:";

/** Leading words that run the next word as the command (`npx vitest`, `time go test`). */
const WRAPPERS = new Set(["npx", "bunx", "pnpx", "time", "env", "sudo", "exec", "command", "nice"]);

/** Two-word wrappers: `uv run pytest`, `bundle exec rspec`, `pnpm exec jest`. */
const WRAPPER_PAIRS: Readonly<Record<string, ReadonlySet<string>>> = {
  uv: new Set(["run"]),
  poetry: new Set(["run"]),
  pipenv: new Set(["run"]),
  hatch: new Set(["run"]),
  pdm: new Set(["run"]),
  bundle: new Set(["exec"]),
  pnpm: new Set(["exec", "dlx"]),
  yarn: new Set(["exec", "dlx"]),
};

/** Commands that are a test runner on their own. */
const RUNNERS = new Set([
  "vitest",
  "jest",
  "mocha",
  "ava",
  "tap",
  "pytest",
  "py.test",
  "rspec",
  "phpunit",
  "pest",
  "tox",
  "nox",
  "karma",
  "ctest",
  "nextest",
]);

/** Toolchains whose `test` subcommand runs the tests (`go test`, `cargo test`). */
const TEST_SUBCOMMAND = new Set([
  "go",
  "cargo",
  "dotnet",
  "swift",
  "mix",
  "deno",
  "bun",
  "flutter",
  "dart",
  "zig",
  "playwright",
  "stack",
  "cabal",
  "lein",
  "sbt",
]);

/** Package managers whose scripts name the test run (`npm test`, `yarn test:unit`). */
const SCRIPT_RUNNERS = new Set(["npm", "pnpm", "yarn", "bun"]);

/** Build tools whose goals/tasks name the test run (`mvn verify`, `./gradlew :app:test`). */
const BUILD_TOOLS = new Set(["mvn", "mvnw", "gradle", "gradlew", "make", "rake", "ant"]);

/** A build-tool goal or task that runs tests. */
const BUILD_TEST_GOAL = /^(?:test|tests|check|verify|spec|integrationTest|.*:test)$/;

/** True when one shell segment (no separators) runs tests. */
function segmentRunsTests(segment: string): boolean {
  let words = segment.trim().split(/\s+/).filter(Boolean);
  // Strip env assignments and wrappers until the real command leads.
  for (;;) {
    const first = words[0];
    if (!first) return false;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first) || WRAPPERS.has(first)) {
      words = words.slice(1);
      continue;
    }
    const pair = WRAPPER_PAIRS[path.basename(first)];
    if (pair && words[1] && pair.has(words[1])) {
      words = words.slice(2);
      continue;
    }
    break;
  }
  const verb = path.basename(words[0]!);
  const rest = words.slice(1).filter((w) => !w.startsWith("-"));
  const flags = words.slice(1);
  if (RUNNERS.has(verb)) return true;
  if (/^python[\d.]*$/.test(verb)) {
    const m = flags.indexOf("-m");
    return m !== -1 && /^(?:pytest|unittest|nose2?)$/.test(flags[m + 1] ?? "");
  }
  if (verb === "node") return flags.includes("--test");
  if (verb === "cypress") return rest[0] === "run";
  if (verb === "cargo" && rest[0] === "nextest") return true;
  if (SCRIPT_RUNNERS.has(verb)) {
    const script = rest[0] === "run" || rest[0] === "run-script" ? rest[1] : rest[0];
    // `pretest`/`posttest` are the hooks around a run, not the run.
    return !!script && (script === "t" || (/test/i.test(script) && !/^(?:pre|post)/.test(script)));
  }
  if (TEST_SUBCOMMAND.has(verb)) return rest[0] === "test";
  if (BUILD_TOOLS.has(verb)) return rest.some((w) => BUILD_TEST_GOAL.test(w));
  return false;
}

/**
 * True when a shell command runs a test suite, for any common toolchain:
 * `npm test`, `npx vitest`, `node --test`, `pytest`, `python -m pytest`,
 * `go test`, `cargo test`, `mvn test`, `./gradlew check`, `dotnet test`, …
 * Each `&&`/`||`/`;`/newline segment is checked, and only the command before a
 * pipe (`npm test 2>&1 | tail` runs tests; `cat log | grep test` does not).
 *
 * @param command - The Bash tool's command string.
 */
export function isTestCommand(command: string): boolean {
  return command
    .split(/\|\||&&|;|\n/)
    .map((c) => c.split("|")[0] ?? "")
    .some(segmentRunsTests);
}

/**
 * A line that reports failing tests, across runners: `not ok`, `FAIL`/`FAILED`
 * (jest, go, pytest), `--- FAIL:`, `✖`/`✗`, `N failed|failing|failures`,
 * TAP's `# fail N`, Maven's `Failures: N` / `BUILD FAILURE`, cargo's
 * `test result: FAILED`, and a Rust panic.
 */
const FAILURE_LINE =
  /^\s*(?:not ok\b|FAIL(?:ED)?\b|--- FAIL:|[✖✗×]|# fail\s+[1-9])|\b[1-9]\d*\s+(?:failed|failing|failures?)\b|\bFailures:\s*[1-9]|BUILD FAILURE|test result: FAILED|panicked at/m;

/** The first failure-reporting line of a test run's output, or null when it shows none. */
export function failureLine(output: string): string | null {
  const m = FAILURE_LINE.exec(output);
  if (!m) return null;
  const start = output.lastIndexOf("\n", m.index) + 1;
  const end = output.indexOf("\n", m.index);
  return output.slice(start, end === -1 ? undefined : end).trim();
}

/** Inputs the test nudges read from a check call. */
export interface TestNudgeInput {
  projectPath: string;
  event: string;
  toolName?: string;
  payload: Record<string, unknown>;
}

/** A usable string: non-empty and not an unsubstituted `${…}` hook placeholder. */
function usable(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && !s.includes("${") ? s : null;
}

/** A short, stable hash (FNV-1a, base36) — the failure signature's key. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The failure a completed test command reported, or null when it passed:
 * `PostToolUseFailure` (non-zero exit) carries `error`; a `PostToolUse` whose
 * exit was masked (`npm test | tail`) still shows failing lines in its output,
 * or a non-zero `exit_code` when the agent reports one.
 */
function testFailure(event: string, payload: Record<string, unknown>): string | null {
  if (event === "PostToolUseFailure") {
    // An interrupted run (the user stopped it) is not a failing test.
    if (payload.is_interrupt === true || payload.is_interrupt === "true") return null;
    return usable(payload.error) ?? "test command failed";
  }
  const response = (payload.tool_response ?? payload.toolResponse) as
    Record<string, unknown> | undefined;
  if (!response || typeof response !== "object") return null;
  const out = [usable(response.stdout), usable(response.stderr)].filter(Boolean).join("\n");
  const line = out ? failureLine(out) : null;
  if (line) return line;
  const code = Number(usable(String(response.exit_code ?? response.exitCode ?? "")) ?? 0);
  return Number.isFinite(code) && code !== 0 ? out || `exit code ${code}` : null;
}

/** A compile or build step a test command may need first (`npm run pretest`, `tsc`). */
const SETUP_STEP = /\b(pretest|build|tsc|compile|prepare)\b/;

/** A summary line that reports zero failures (`ℹ fail 0`, `0 failed`, `Tests: 12 passed`). */
const ZERO_FAIL =
  /(^|\n)\s*(ℹ|#)\s*fail 0\b|\b0 (failed|failing|failures)\b|\bTests:\s+\d+ passed(?![^\n]*fail)|\b\d+ passed(?![^\n]*fail)|test result: ok\b|(^|\n)ok\s+\S+/;

/**
 * Record a passing test run for the stop to reuse. Only a `PostToolUse` call
 * counts (the command exited 0). A piped command may have hidden a failing
 * exit, so it counts only when its output still shows a zero-failure summary.
 */
function recordPassingRun(
  projectPath: string,
  command: string,
  payload: Record<string, unknown>,
): void {
  const response = (payload.tool_response ?? payload.toolResponse) as
    Record<string, unknown> | undefined;
  const out =
    response && typeof response === "object"
      ? [usable(response.stdout), usable(response.stderr)].filter(Boolean).join("\n")
      : "";
  if (/\|/.test(command.replace(/\|\|/g, "")) && !ZERO_FAIL.test(out)) return;
  recordGreenRun(projectPath, command, out);
}

/**
 * Evaluate the test-run nudges for one check call.
 *
 * Fires only for a Bash test command (see {@link isTestCommand}) in a project
 * whose index holds at least {@link NUDGE_MIN_INDEXED_FILES} files. A failing
 * run returns the `lawbook_investigate` hint, once per failure signature (the
 * command plus its first failing line, digits dropped) per
 * {@link TEST_NUDGE_WINDOW_MS}, recorded in the call log for its rate limit.
 * A passing run is recorded for the stop to reuse and gets no hint: in real runs a "run only the covering tests"
 * hint made agents widen a one-test run to whole files (~60 s more on a
 * one-line fix) and none called the tool. Returns null otherwise. Never throws.
 *
 * @param args - The check call's project, event, tool, and raw payload.
 * @param now - Current epoch ms (injectable for tests).
 */
export function testNudge(args: TestNudgeInput, now: number = Date.now()): string | null {
  try {
    if (args.event !== "PostToolUse" && args.event !== "PostToolUseFailure") return null;
    const payload = args.payload ?? {};
    if ((usable(args.toolName) ?? usable(payload.tool_name)) !== "Bash") return null;
    const input = (payload.tool_input ?? payload.toolInput ?? {}) as Record<string, unknown>;
    const command = usable(input.command);
    if (!command) return null;
    if (!isTestCommand(command)) {
      // A passing compile step lets a later test run count as run on current code.
      if (args.event === "PostToolUse" && SETUP_STEP.test(command)) {
        recordGreenRun(args.projectPath, command, "", new Date(now), "setup");
      }
      return null;
    }
    const failure = testFailure(args.event, payload);
    if (!failure) {
      recordPassingRun(args.projectPath, command, payload);
      return null;
    }
    const indexed = readIndexStats(args.projectPath);
    if (!indexed || indexed.files < NUDGE_MIN_INDEXED_FILES) return null;

    const recent = readCompassCalls(args.projectPath, { sinceMs: now - TEST_NUDGE_WINDOW_MS });
    const first = failureLine(failure) ?? failure.split("\n").find((l) => l.trim()) ?? "";
    const sig = hash(`${command.replace(/\s+/g, " ")}\n${first.replace(/\d+/g, "#")}`);
    const entry = `${INVESTIGATE_NUDGE_PREFIX}${sig}`;
    if (recent.some((c) => c.tool === entry)) return null;
    recordCompassCall(args.projectPath, entry, new Date(now));
    return (
      "Tests failed: call `lawbook_investigate` with the failing output as `stackTrace` " +
      "— it ranks the code the failing test reaches — before opening files."
    );
  } catch {
    return null;
  }
}
