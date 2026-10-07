import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import {
  buildStatusSummary,
  countTaskCheckboxes,
  readStatusIntervalMinutes,
} from "../../src/modules/cortex/status.js";
import { handleHarness, type HarnessStatusResult } from "../../src/modules/cortex/harness.js";
import { fitStatusResult } from "../../src/modules/cortex/status.js";
import { registerCortex } from "../../src/modules/cortex/register.js";
import { registerSpec } from "../../src/modules/lawbook/register.js";
import { captureTools, isTextResult } from "../helpers/contracts.js";
import { applyTextBudget } from "../../src/shared/output-budget.js";
import type { HarnessState } from "../../src/modules/cortex/types.js";

const NOW = new Date("2026-10-06T12:00:00.000Z");

function state(over: Partial<HarnessState> = {}): HarnessState {
  return {
    version: 1,
    change: "feat",
    stage: "implementing",
    level: 2,
    iteration: 0,
    maxRework: 3,
    verdicts: { review: null, test: null },
    openQuestions: [],
    history: [
      { at: "2026-10-06T11:30:00.000Z", from: "exploring", to: "exploring", op: "start" },
      { at: "2026-10-06T11:48:00.000Z", from: "planning", to: "implementing", op: "advance" },
    ],
    ...over,
  };
}

function seedChange(root: string, files: Record<string, string> = {}): void {
  write(root, "lawbook/changes/feat/proposal.md", "# p\n");
  for (const [rel, body] of Object.entries(files)) write(root, `lawbook/changes/feat/${rel}`, body);
}

test("countTaskCheckboxes counts list checkboxes and ignores other brackets", () => {
  const md = [
    "# Tasks",
    "- [x] 1.1 done",
    "- [X] 1.2 done upper",
    "  - [ ] 1.3 nested open",
    "* [x] 1.4 star bullet",
    "* [ ] 1.5 star open",
    "Text with [x] inline is not a task",
    "[ ] bare bracket is not a task",
    "- plain item",
  ].join("\n");
  assert.deepEqual(countTaskCheckboxes(md), { done: 3, total: 5 });
  assert.deepEqual(countTaskCheckboxes(""), { done: 0, total: 0 });
});

// Covers: req~cortex-status-summary~1
test("summary reports role, elapsed, tasks, rework and pending verdicts", (t) => {
  const root = tmpRepo(t);
  const tasks = ["- [x] a", "- [x] b", "- [x] c", ...Array(6).fill("- [ ] open")].join("\n");
  seedChange(root, { "tasks.md": tasks });
  const s = buildStatusSummary(root, state(), NOW);
  assert.equal(s.change, "feat");
  assert.equal(s.stage, "implementing");
  assert.equal(s.role, "implementer");
  assert.equal(s.stageStartedAt, "2026-10-06T11:48:00.000Z");
  assert.equal(s.elapsedMinutes, 12);
  assert.deepEqual(s.tasks, { done: 3, total: 9 });
  assert.equal(s.iteration, 0);
  assert.equal(s.maxRework, 3);
  assert.deepEqual(s.pendingVerdicts, ["review", "test"]);
  assert.equal(s.openQuestions, 0);
  assert.equal(s.statusIntervalMinutes, 5);
  assert.equal(
    s.line,
    "feat · implementing (implementer) · 12m in stage · tasks 3/9 · rework 0/3 · pending: review, test",
  );
  assert.ok(!s.line.includes("\n"));
});

test("level 0 owes only test and counts record.md when tasks.md is absent", (t) => {
  const root = tmpRepo(t);
  seedChange(root, { "record.md": "# Record\n- [x] one\n- [x] two\n" });
  const s = buildStatusSummary(root, state({ level: 0, stage: "testing" }), NOW);
  assert.deepEqual(s.tasks, { done: 2, total: 2 });
  assert.deepEqual(s.pendingVerdicts, ["test"]);
  assert.equal(s.role, "tester");
  assert.match(s.line, /elapsed n\/a/);
});

test("no tasks.md nor record.md gives null tasks; PASS verdicts are not pending", (t) => {
  const root = tmpRepo(t);
  seedChange(root);
  const s = buildStatusSummary(
    root,
    state({ stage: "archiving", verdicts: { review: "PASS", test: "PASS" } }),
    NOW,
  );
  assert.equal(s.tasks, null);
  assert.deepEqual(s.pendingVerdicts, []);
  assert.match(s.line, /tasks n\/a/);
  assert.match(s.line, /pending: none$/);

  const reviewed = buildStatusSummary(
    root,
    state({ stage: "testing", verdicts: { review: "PASS", test: "FAIL" } }),
    NOW,
  );
  assert.deepEqual(reviewed.pendingVerdicts, ["test"]);
});

test("elapsed is null without a matching or parseable start and never negative", (t) => {
  const root = tmpRepo(t);
  seedChange(root);
  const noMatch = buildStatusSummary(root, state({ stage: "reviewing" }), NOW);
  assert.equal(noMatch.stageStartedAt, null);
  assert.equal(noMatch.elapsedMinutes, null);

  const bad = state({
    history: [{ at: "not-a-date", from: "planning", to: "implementing", op: "advance" }],
  });
  assert.equal(buildStatusSummary(root, bad, NOW).elapsedMinutes, null);

  const future = state({
    history: [
      { at: "2026-10-06T13:00:00.000Z", from: "planning", to: "implementing", op: "advance" },
    ],
  });
  assert.equal(buildStatusSummary(root, future, NOW).elapsedMinutes, 0);

  const done = buildStatusSummary(
    root,
    state({
      stage: "done",
      history: [{ at: NOW.toISOString(), from: "archiving", to: "done", op: "advance" }],
    }),
    NOW,
  );
  assert.equal(done.role, null);
  assert.match(done.line, /^feat · done · 0m in stage/);
});

test("questions stage says the human owes answers", (t) => {
  const root = tmpRepo(t);
  seedChange(root);
  const s = buildStatusSummary(
    root,
    state({
      stage: "questions",
      openQuestions: ["a?", "b?"],
      history: [
        { at: "2026-10-06T11:55:00.000Z", from: "planning", to: "questions", op: "advance" },
      ],
    }),
    NOW,
  );
  assert.equal(s.openQuestions, 2);
  assert.equal(s.role, "planner");
  assert.match(s.line, /questions \(planner\) · 5m in stage/);
  assert.match(s.line, / · waiting on human: 2 question\(s\)$/);
});

// Covers: req~cortex-status-interval~1
test("status interval reads cortex.statusIntervalMinutes with a safe default", (t) => {
  const root = tmpRepo(t);
  assert.equal(readStatusIntervalMinutes(root), 5, "missing file");

  const cfg = (body: string): number => {
    write(root, "lawbook/config.yaml", body);
    return readStatusIntervalMinutes(root);
  };
  assert.equal(cfg("schema: lawbook\ncompassGate: warn\n"), 5, "no cortex block");
  assert.equal(cfg("cortex:\n  other: 1\nnext: x\n  statusIntervalMinutes: 9\n"), 5, "key outside");
  assert.equal(cfg("cortex:\n  statusIntervalMinutes: 10\n"), 10);
  assert.equal(cfg("cortex:\n  # cadence\n\n  statusIntervalMinutes: 0 # off\n"), 0);
  assert.equal(cfg('cortex: # block\n  statusIntervalMinutes: "15"\n'), 15);
  assert.equal(cfg("cortex:\n  statusIntervalMinutes: -1\n"), 5);
  assert.equal(cfg("cortex:\n  statusIntervalMinutes: abc\n"), 5);
  assert.equal(cfg("cortex:\n  statusIntervalMinutes: 2.5\n"), 5);
  assert.equal(cfg("# cortex:\n#   statusIntervalMinutes: 7\n"), 5, "commented out");
  assert.equal(cfg("statusIntervalMinutes: 7\n"), 5, "top-level key is not the cortex block");
  assert.equal(cfg("cortex:\n  statusIntervalMinutes: 60\n"), 60, "hourly is the maximum");
  assert.equal(cfg("cortex:\n  statusIntervalMinutes: 61\n"), 60, "clamped to 60");
  assert.equal(cfg("cortex:\n  statusIntervalMinutes: 1440\n"), 60, "clamped to 60");
});

test("summary reports the configured interval", (t) => {
  const root = tmpRepo(t);
  seedChange(root);
  write(root, "lawbook/config.yaml", "cortex:\n  statusIntervalMinutes: 10\n");
  assert.equal(buildStatusSummary(root, state(), NOW).statusIntervalMinutes, 10);
});

test("handleHarness status returns a null summary without a harness", (t) => {
  const root = tmpRepo(t);
  seedChange(root);
  assert.deepEqual(handleHarness({ projectPath: root, change: "feat", harnessOp: "status" }), {
    state: null,
    summary: null,
  });
});

/** A harness with `n` history entries, each carrying a long note (a rework-heavy run). */
function longRun(n: number): HarnessState {
  const history = Array.from({ length: n }, (_, i) => ({
    at: new Date(Date.UTC(2026, 9, 6, 8, i)).toISOString(),
    from: "reviewing" as const,
    to: i === n - 1 ? ("implementing" as const) : ("reviewing" as const),
    op: "rework" as const,
    note: `entry ${i}: ` + "FAIL finding with a long reviewer note. ".repeat(10),
  }));
  return state({ iteration: 2, history });
}

// Covers: req~cortex-status-summary~1
test("MCP cortex status keeps the full summary and valid JSON on a long history", async (t) => {
  const root = tmpRepo(t);
  seedChange(root, { "tasks.md": "- [x] a\n- [ ] b\n" });
  const harness = longRun(30);
  write(root, "lawbook/changes/feat/harness.json", JSON.stringify(harness, null, 2));
  const raw = JSON.stringify(
    handleHarness({ projectPath: root, change: "feat", harnessOp: "status" }),
    null,
    2,
  );
  assert.ok(applyTextBudget(raw).truncated, "fixture must exceed the brief budget unfitted");

  const tools = captureTools(registerCortex);
  const out = await tools
    .get("cortex")!
    .handler({ projectPath: root, change: "feat", action: "status" });
  assert.ok(isTextResult(out));
  const body = out.content[0]!.text;
  assert.ok(!body.includes("[truncated"), "fitted result is not cut by text()");
  const parsed = JSON.parse(body) as {
    summary: Record<string, unknown>;
    historyOmitted: number;
    state: HarnessState;
  };
  assert.deepEqual(Object.keys(parsed), ["summary", "historyOmitted", "state"]);
  const expected = buildStatusSummary(root, harness);
  const { elapsedMinutes: _e, line: _l, ...stable } = expected;
  for (const [key, value] of Object.entries(stable)) {
    assert.deepEqual(parsed.summary[key], value, `summary.${key}`);
  }
  assert.equal(parsed.summary.statusIntervalMinutes, 5);
  assert.equal(typeof parsed.summary.line, "string");
  assert.ok(parsed.historyOmitted > 0);
  assert.equal(parsed.historyOmitted + parsed.state.history.length, 30);
  assert.deepEqual(parsed.state.history.at(-1), harness.history.at(-1), "newest entry kept");
  assert.equal(parsed.state.stage, "implementing");

  // harness.json itself is untouched by the MCP rendering.
  const status = handleHarness({
    projectPath: root,
    change: "feat",
    harnessOp: "status",
  }) as HarnessStatusResult;
  assert.equal(status.state!.history.length, 30);

  // The deprecated alias goes through the same fitting.
  const alias = captureTools(registerSpec);
  const aliasOut = await alias.get("lawbook_change")!.handler({
    projectPath: root,
    action: "harness",
    harnessOp: "status",
    change: "feat",
  });
  assert.ok(isTextResult(aliasOut));
  const aliasParsed = JSON.parse(aliasOut.content[0]!.text) as { summary: { change: string } };
  assert.equal(aliasParsed.summary.change, "feat");
});

test("fitStatusResult leaves a small result whole and summary-first", (t) => {
  const root = tmpRepo(t);
  seedChange(root);
  const s = state();
  const summary = buildStatusSummary(root, s, NOW);
  const fitted = fitStatusResult({ state: s, summary });
  assert.deepEqual(Object.keys(fitted), ["summary", "state"]);
  assert.deepEqual(fitted.state, s);
  assert.deepEqual(fitStatusResult({ state: null, summary: null }), { summary: null, state: null });
});

test("fitStatusResult drops state when even an empty history does not fit", (t) => {
  const root = tmpRepo(t);
  seedChange(root);
  const s = state({
    openQuestions: Array(50).fill("a long open question for the human ".repeat(4)),
  });
  const summary = buildStatusSummary(root, s, NOW);
  const fitted = fitStatusResult({ summary, state: s }, 300);
  assert.deepEqual(fitted, { summary, stateOmitted: true, state: null });
});
