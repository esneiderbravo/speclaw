import fs from "node:fs";
import path from "node:path";

// Green test runs the agent made, so the stop does not re-run the same tests on
// the same code: the edit hook records them, ship reuses what still holds.

/** Log file name under `.speclaw/`. */
export const TEST_RUN_LOG = "test-runs.jsonl";

/** The log keeps at most this many runs; older ones cannot outlive an edit anyway. */
const KEEP_RUNS = 40;

/** Output lines kept per run, enough for the report's tail. */
const TAIL_LINES = 20;

/** One passing test command the agent ran. */
export interface GreenRun {
  /** ISO time the run finished (when the hook saw it). */
  at: string;
  /** The command as the agent ran it. */
  command: string;
  /** Last lines of its output. */
  tail: string;
  /** `setup`: a passing compile/build step, not a test run. */
  kind?: "setup";
}

/**
 * Append a passing run; trims the log to the last {@link KEEP_RUNS}. Best-effort:
 * never throws.
 */
export function recordGreenRun(
  projectPath: string,
  command: string,
  output: string,
  at: Date = new Date(),
  kind?: "setup",
): void {
  try {
    const dir = path.join(projectPath, ".speclaw");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, TEST_RUN_LOG);
    const tail = output.trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
    const run: GreenRun = { at: at.toISOString(), command, tail, ...(kind ? { kind } : {}) };
    const line = JSON.stringify(run);
    const kept = readLines(file).slice(-(KEEP_RUNS - 1));
    fs.writeFileSync(file, [...kept, line].join("\n") + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

/** Recorded runs, oldest first. Never throws. */
export function readGreenRuns(projectPath: string): GreenRun[] {
  const out: GreenRun[] = [];
  for (const line of readLines(path.join(projectPath, ".speclaw", TEST_RUN_LOG))) {
    try {
      const r = JSON.parse(line) as Partial<GreenRun>;
      if (typeof r.at === "string" && typeof r.command === "string") {
        out.push({
          at: r.at,
          command: r.command,
          tail: typeof r.tail === "string" ? r.tail : "",
          ...(r.kind === "setup" ? { kind: "setup" as const } : {}),
        });
      }
    } catch {
      /* skip a torn line */
    }
  }
  return out;
}

function readLines(file: string): string[] {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Flags that run part of a file: such a run does not cover the whole file. */
const FILTER_FLAG =
  /(^|\s)(--test-name-pattern|--test-skip-pattern|--test-only|-t|--testNamePattern|--grep|-g|-k|-m|--only|--filter|-run)(=|\s|$)/;

/** Whitespace tokens of a shell command, quotes dropped. */
function tokens(command: string): string[] {
  return command
    .split(/\s+/)
    .map((t) => t.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/** What a planned test command can skip, and the command that is left. */
export interface TestReuse {
  /** Test files a green run already covered. */
  covered: string[];
  /** The planned command without them, or null when nothing is left to run. */
  command: string | null;
  /** The newest run that covered something (its tail goes in the report). */
  run: GreenRun;
}

/**
 * Which files of a planned `setup && runner file…` command a green run already
 * ran on the current code. A run counts only when it finished after the last
 * edit to any changed file, ran every setup step the plan runs (a compile
 * before `node --test` — without it the run tested stale output) in the same
 * command or in a passing step between the last edit and the run, and used no
 * filter that runs part of a file. A plain whole-suite run (`npm test`) covers
 * everything.
 *
 * @param planned - The command the stop would run.
 * @param testFiles - The test paths as they appear in `planned`.
 * @param lastEditMs - Newest mtime among the changed files (epoch ms).
 * @param wholeSuite - Matches a plain whole-suite command (`npm test`).
 * @returns The reuse, or null when no run covers anything.
 */
export function reuseGreenRuns(
  runs: GreenRun[],
  planned: string,
  testFiles: string[],
  lastEditMs: number,
  wholeSuite: (command: string) => boolean,
): TestReuse | null {
  const amp = planned.lastIndexOf("&&");
  const setup = amp === -1 ? "" : planned.slice(0, amp).trim();
  const covered = new Set<string>();
  let last: GreenRun | null = null;
  const setups = runs.filter((r) => r.kind === "setup" && Date.parse(r.at) > lastEditMs);
  for (const run of runs) {
    if (run.kind === "setup" || Date.parse(run.at) <= lastEditMs) continue;
    if (wholeSuite(run.command.trim())) {
      testFiles.forEach((f) => covered.add(f));
      last = run;
      continue;
    }
    if (FILTER_FLAG.test(run.command)) continue;
    const compiled =
      !setup ||
      run.command.includes(setup) ||
      setups.some((s) => s.command.includes(setup) && Date.parse(s.at) <= Date.parse(run.at));
    if (!compiled) continue;
    const ran = new Set(tokens(run.command));
    const hit = testFiles.filter((f) => ran.has(f));
    if (!hit.length) continue;
    hit.forEach((f) => covered.add(f));
    last = run;
  }
  if (!last || covered.size === 0) return null;
  const left = testFiles.filter((f) => !covered.has(f));
  if (!left.length) return { covered: [...covered], command: null, run: last };
  const run = planned
    .slice(amp === -1 ? 0 : amp + 2)
    .split(/\s+/)
    .filter((t) => t && !covered.has(t.replace(/^['"]|['"]$/g, "")))
    .join(" ");
  return { covered: [...covered], command: setup ? `${setup} && ${run}` : run, run: last };
}
