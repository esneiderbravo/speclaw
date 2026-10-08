import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { tmpRepo } from "../helpers/env.js";
import { runCli, cliBuilt } from "../helpers/cli.js";
import { checkAction, clearLawCache } from "../../src/modules/foundation/check.js";
import {
  INVESTIGATE_NUDGE_PREFIX,
  failureLine,
  isTestCommand,
  testNudge,
} from "../../src/modules/foundation/test-nudge.js";
import { writeIndexStats } from "../../src/shared/index-stats.js";
import { readCompassCalls, recordCompassCall } from "../../src/shared/compass-calls.js";

const MIN = 60 * 1000;

/** A fresh project whose index is large enough for the nudges to speak. */
function indexed(t: Parameters<typeof tmpRepo>[0], files = 400): string {
  clearLawCache();
  const root = tmpRepo(t);
  writeIndexStats(root, { files, nodes: files * 5 });
  return root;
}

const failed = (root: string, command: string, error: string) =>
  checkAction({
    projectPath: root,
    event: "PostToolUseFailure",
    toolName: "Bash",
    payload: { hook_event_name: "PostToolUseFailure", tool_input: { command }, error },
  });

const ran = (root: string, command: string, stdout = "", stderr = "") =>
  checkAction({
    projectPath: root,
    event: "PostToolUse",
    toolName: "Bash",
    payload: { tool_input: { command }, tool_response: { stdout, stderr } },
  });

test("isTestCommand recognizes test runs across toolchains", () => {
  for (const cmd of [
    "npm test",
    "npm t",
    "npm run test:unit -- --grep x",
    "yarn test",
    "pnpm vitest run",
    "bun test",
    "npx vitest run src/a.test.ts",
    "npx jest --ci",
    "npm run build && node --test dist-test/a.test.js",
    "npm run pretest && node --test dist-test/test/unit/hooks.test.js",
    "CI=1 npm test 2>&1 | tail -40",
    "pytest -x tests/",
    "python -m pytest -k foo",
    "uv run pytest",
    "poetry run pytest",
    "go test ./...",
    "cargo test --all",
    "cargo nextest run",
    "mvn -q test",
    "./mvnw verify",
    "./gradlew :app:test",
    "gradle check",
    "dotnet test",
    "bundle exec rspec",
    "make test",
    "deno test",
    "npx playwright test",
    "cd backend && pytest",
  ]) {
    assert.ok(isTestCommand(cmd), cmd);
  }
});

test("isTestCommand ignores commands that do not run tests", () => {
  for (const cmd of [
    "npm install",
    "npm run build",
    "npm run pretest",
    "yarn add -D @testing-library/react",
    "cat test/unit/a.test.ts",
    "grep -rn test src",
    "cat log.txt | pytest",
    "git commit -m 'test: add'",
    "go build ./...",
    "mvn package",
    "ls test",
  ]) {
    assert.ok(!isTestCommand(cmd), cmd);
  }
});

test("failureLine finds failing output across runners and stays silent on a pass", () => {
  assert.equal(failureLine("ok 1 - a\nnot ok 2 - b\n"), "not ok 2 - b");
  assert.match(failureLine("PASS a\nFAIL src/b.test.ts\n") ?? "", /^FAIL src\/b/);
  assert.match(failureLine("--- FAIL: TestX (0.00s)") ?? "", /TestX/);
  assert.match(failureLine("=== 2 failed, 10 passed in 0.3s ===") ?? "", /2 failed/);
  assert.match(failureLine("Tests run: 5, Failures: 1, Errors: 0") ?? "", /Failures: 1/);
  assert.match(failureLine("test result: FAILED. 1 passed; 1 failed") ?? "", /FAILED/);
  assert.match(failureLine("# tests 3\n# pass 2\n# fail 1\n") ?? "", /# fail 1/);
  assert.equal(failureLine("# tests 3\n# pass 3\n# fail 0\n"), null);
  assert.equal(failureLine("Tests: 0 failed, 12 passed"), null);
  assert.equal(failureLine("10 passing (2s)"), null);
});

test("a failing test run points at lawbook_investigate with the output as stackTrace", (t) => {
  const root = indexed(t);
  const r = failed(root, "npm test", "Exit code 1\nnot ok 1 - adds\n  at add (src/a.ts:3:9)");
  assert.equal(r.verdict, "allow");
  assert.deepEqual(r.evaluated, []);
  assert.match(r.nudge ?? "", /`lawbook_investigate`/);
  assert.match(r.nudge ?? "", /`stackTrace`/);
  assert.deepEqual(r.hookSpecificOutput, {
    hookEventName: "PostToolUseFailure",
    additionalContext: r.nudge,
  });
  assert.ok(readCompassCalls(root).some((c) => c.tool.startsWith(INVESTIGATE_NUDGE_PREFIX)));
});

test("the investigate hint fires once per failure signature, not on every run", (t) => {
  const root = indexed(t);
  const out = "not ok 1 - adds (12ms)";
  assert.ok(failed(root, "npm test", out).nudge);
  // the same failure again (timings differ) stays silent
  assert.equal(failed(root, "npm test", "not ok 1 - adds (40ms)").nudge, undefined);
  // a different failure is a new signature
  assert.ok(failed(root, "npm test", "not ok 3 - subtracts").nudge);

  const now = Date.parse("2026-05-01T12:00:00.000Z");
  const other = indexed(t);
  const args = {
    projectPath: other,
    event: "PostToolUseFailure",
    toolName: "Bash",
    payload: { tool_input: { command: "go test ./..." }, error: "--- FAIL: TestX" },
  };
  assert.ok(testNudge(args, now));
  assert.equal(testNudge(args, now + 30 * MIN), null);
  assert.ok(testNudge(args, now + 61 * MIN));
});

test("a piped run whose exit code hid the failure still gets the investigate hint", (t) => {
  const root = indexed(t);
  const r = ran(root, "npm test 2>&1 | tail -20", "# tests 4\n# pass 3\n# fail 1\n");
  assert.match(r.nudge ?? "", /lawbook_investigate/);
  assert.equal(r.hookSpecificOutput?.hookEventName, "PostToolUse");
});

test("a passing test run gets no hint", (t) => {
  const root = indexed(t);
  assert.equal(ran(root, "npx vitest run", "Tests: 12 passed").nudge, undefined);
  assert.equal(ran(root, "pytest").nudge, undefined);
});

test("the test nudges stay silent off-target", (t) => {
  // not a test command
  const root = indexed(t);
  assert.equal(failed(root, "npm run build", "error TS2322").nudge, undefined);
  assert.equal(ran(root, "npm install").nudge, undefined);
  // a non-Bash tool
  const r = checkAction({
    projectPath: root,
    event: "PostToolUseFailure",
    toolName: "Read",
    payload: { tool_input: { command: "npm test" }, error: "x" },
  });
  assert.equal(r.nudge, undefined);
  assert.equal(r.hookSpecificOutput, undefined);
  // no index, or one too small for a graph query to pay off
  clearLawCache();
  const bare = tmpRepo(t);
  assert.equal(failed(bare, "npm test", "not ok 1").nudge, undefined);
  const small = indexed(t, 3);
  assert.equal(failed(small, "npm test", "not ok 1").nudge, undefined);
  // unsubstituted hook placeholders are no input
  assert.equal(failed(root, "${tool_input.command}", "${error}").nudge, undefined);
});

test("the test-nudge path stays well inside the hook budget", (t) => {
  const root = indexed(t);
  for (let i = 0; i < 200; i++) recordCompassCall(root, "compass_find");
  const output = "ok 1\n".repeat(5000) + "not ok 5001 - boom\n";
  const samples: number[] = [];
  for (let i = 0; i < 50; i++) {
    const start = performance.now();
    failed(root, "npm test", output.replace("5001", String(i)));
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)]!;
  assert.ok(p95 < 50, `p95 ${p95.toFixed(2)}ms`);
});

test(
  "speclaw check --hook-payload prints additionalContext for a failed test run",
  { skip: cliBuilt() ? false : "dist/ not built — run `npm run build` first" },
  (t) => {
    const root = indexed(t);
    const payload = JSON.stringify({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "pytest -q" },
      error: "Exit code 1\nFAILED tests/test_a.py::test_add - assert 1 == 2",
    });
    const res = runCli(["check", "--hook-payload", "-"], { cwd: root, input: payload });
    assert.equal(res.code, 0, res.stderr);
    const out = JSON.parse(res.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUseFailure");
    assert.match(out.hookSpecificOutput.additionalContext, /lawbook_investigate/);
  },
);
