// Covers: req~compass-evidence-gate~1
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write, read } from "../helpers/env.js";
import {
  handleHarness,
  type HarnessAdvanceResult,
  type HarnessHistoryEntry,
  type HarnessStage,
  type HarnessState,
} from "../../src/modules/cortex/harness.js";
import {
  evaluateCompassGate,
  readCompassGateMode,
  stageStartedAt,
} from "../../src/modules/cortex/compass-gate.js";
import { recordCompassCall } from "../../src/shared/compass-calls.js";
import { runCli, cliBuilt } from "../helpers/cli.js";

const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const at = (offsetSec: number): Date => new Date(T0 + offsetSec * 1000);
const iso = (offsetSec: number): string => at(offsetSec).toISOString();

function seed(
  root: string,
  stage: HarnessStage,
  history: HarnessHistoryEntry[],
  gate?: string,
): HarnessState {
  write(root, "lawbook/config.yaml", gate === undefined ? "schema: x\n" : `${gate}\n`);
  write(root, "lawbook/changes/feat/change.json", JSON.stringify({ confirmedLevel: 2 }));
  const state: HarnessState = {
    version: 1,
    change: "feat",
    stage,
    level: 2,
    iteration: 0,
    maxRework: 3,
    verdicts: { review: null, test: null },
    openQuestions: [],
    history,
  };
  write(root, "lawbook/changes/feat/harness.json", JSON.stringify(state, null, 2) + "\n");
  return state;
}

const started: HarnessHistoryEntry = {
  at: iso(0),
  from: "exploring",
  to: "exploring",
  op: "start",
};

function advance(root: string): HarnessAdvanceResult {
  return handleHarness({
    projectPath: root,
    change: "feat",
    harnessOp: "advance",
  }) as HarnessAdvanceResult;
}

test("readCompassGateMode parses off/warn/strict, quotes, and comments", (t) => {
  const root = tmpRepo(t);
  const cases: Array<[string, string]> = [
    ["compassGate: off", "off"],
    ["compassGate: warn", "warn"],
    ["compassGate: strict", "strict"],
    ['compassGate: "strict"', "strict"],
    ["compassGate: 'off'  # relax", "off"],
    ["other: 1\ncompassGate: strict # enforce\nmore: 2", "strict"],
  ];
  for (const [yaml, mode] of cases) {
    write(root, "lawbook/config.yaml", yaml + "\n");
    assert.equal(readCompassGateMode(root), mode, yaml);
  }
});

test("a missing, nested, or invalid compassGate falls back to warn", (t) => {
  const root = tmpRepo(t);
  assert.equal(readCompassGateMode(root), "warn", "missing file");
  for (const yaml of [
    "schema: x",
    "compassGate: loud",
    "compassGate:",
    "  compassGate: strict",
    "compassGate: \"strict'",
  ]) {
    write(root, "lawbook/config.yaml", yaml + "\n");
    assert.equal(readCompassGateMode(root), "warn", yaml);
  }
});

test("stageStartedAt picks the newest entry entering the current stage", (t) => {
  const root = tmpRepo(t);
  const state = seed(root, "implementing", [
    started,
    { at: iso(10), from: "exploring", to: "planning", op: "advance" },
    { at: iso(20), from: "planning", to: "implementing", op: "advance" },
    { at: iso(30), from: "implementing", to: "reviewing", op: "advance" },
    { at: iso(40), from: "reviewing", to: "implementing", op: "rework" },
  ]);
  assert.equal(stageStartedAt(state), iso(40));
  assert.equal(stageStartedAt({ ...state, history: [] }), null);
});

test("evaluateCompassGate with no matching history counts every entry", (t) => {
  const root = tmpRepo(t);
  const state = seed(root, "implementing", [started]);
  recordCompassCall(root, "compass_find", at(-1000));
  const r = evaluateCompassGate(root, state);
  assert.equal(r.since, null);
  assert.equal(r.calls, 1);
  assert.equal(r.satisfied, true);
});

test("strict with no evidence rejects leaving exploring and leaves harness.json byte-identical", (t) => {
  const root = tmpRepo(t);
  seed(root, "exploring", [started], "compassGate: strict");
  const before = read(root, "lawbook/changes/feat/harness.json");
  assert.throws(
    () => advance(root),
    (err: Error) =>
      /exploring/.test(err.message) &&
      /compass_explore/.test(err.message) &&
      /compass_find/.test(err.message) &&
      /compassGate/.test(err.message),
  );
  assert.equal(read(root, "lawbook/changes/feat/harness.json"), before);
});

test("strict with evidence since the stage started advances", (t) => {
  const root = tmpRepo(t);
  seed(root, "exploring", [started], "compassGate: strict");
  recordCompassCall(root, "compass_find", at(5));
  const r = advance(root);
  assert.equal(r.stage, "planning");
  assert.ok(r.compassEvidence);
  assert.equal(r.compassEvidence.mode, "strict");
  assert.equal(r.compassEvidence.stage, "exploring");
  assert.equal(r.compassEvidence.since, iso(0));
  assert.ok(r.compassEvidence.calls >= 1);
  assert.equal(r.warnings, undefined);
  // The gate outcome is returned, never persisted.
  assert.doesNotMatch(read(root, "lawbook/changes/feat/harness.json"), /compassEvidence/);
});

test("warn (default) leaving implementing with only compass_index advances with a warning", (t) => {
  const root = tmpRepo(t);
  seed(root, "implementing", [
    started,
    { at: iso(20), from: "planning", to: "implementing", op: "advance" },
  ]);
  recordCompassCall(root, "compass_index", at(25));
  const r = advance(root);
  assert.equal(r.stage, "reviewing");
  assert.equal(r.compassEvidence?.mode, "warn");
  assert.equal(r.compassEvidence?.calls, 0);
  assert.equal(r.warnings?.length, 1);
  assert.match(r.warnings![0]!, /^compass-first/);
});

test("strict: compass_index-only evidence does not satisfy the gate", (t) => {
  const root = tmpRepo(t);
  seed(root, "exploring", [started], "compassGate: strict");
  recordCompassCall(root, "compass_index", at(5));
  assert.throws(() => advance(root), /compass-first/);
});

test("strict: calls before a rework entry do not count", (t) => {
  const root = tmpRepo(t);
  seed(
    root,
    "implementing",
    [
      started,
      { at: iso(20), from: "planning", to: "implementing", op: "advance" },
      { at: iso(30), from: "implementing", to: "reviewing", op: "advance" },
      { at: iso(40), from: "reviewing", to: "implementing", op: "rework" },
    ],
    "compassGate: strict",
  );
  recordCompassCall(root, "compass_explore", at(25));
  assert.throws(() => advance(root), /compass-first/);
  recordCompassCall(root, "compass_explore", at(45));
  assert.equal(advance(root).stage, "reviewing");
});

test("off mode skips the gate entirely", (t) => {
  const root = tmpRepo(t);
  seed(root, "exploring", [started], "compassGate: off");
  const r = advance(root);
  assert.equal(r.stage, "planning");
  assert.equal(r.compassEvidence, undefined);
  assert.equal(r.warnings, undefined);
});

test("leaving planning is not gated, even in strict mode", (t) => {
  const root = tmpRepo(t);
  seed(
    root,
    "planning",
    [started, { at: iso(10), from: "exploring", to: "planning", op: "advance" }],
    "compassGate: strict",
  );
  const r = advance(root);
  assert.equal(r.stage, "implementing");
  assert.equal(r.compassEvidence, undefined);
  assert.equal(r.warnings, undefined);
});

test("start, status, and rework are never gated in strict mode", (t) => {
  const root = tmpRepo(t);
  write(root, "lawbook/config.yaml", "compassGate: strict\n");
  write(root, "lawbook/changes/feat/change.json", JSON.stringify({ confirmedLevel: 2 }));
  const s = handleHarness({ projectPath: root, change: "feat", harnessOp: "start" });
  assert.equal((s as HarnessState).stage, "exploring");
  assert.ok(handleHarness({ projectPath: root, change: "feat", harnessOp: "status" }));

  seed(
    root,
    "reviewing",
    [started, { at: iso(30), from: "implementing", to: "reviewing", op: "advance" }],
    "compassGate: strict",
  );
  const r = handleHarness({
    projectPath: root,
    change: "feat",
    harnessOp: "rework",
    verdict: "FAIL",
  }) as HarnessAdvanceResult;
  assert.equal(r.stage, "implementing");
  assert.equal(r.compassEvidence, undefined);
});

test(
  "CLI cortex advance prints the warn-mode warning to stderr and the strict rejection",
  { skip: cliBuilt() ? false : "dist/ not built — run `npm run build` first" },
  (t) => {
    const root = tmpRepo(t);
    seed(root, "exploring", [started]);
    const warned = runCli(["cortex", "advance", "--change", "feat"], { cwd: root });
    assert.equal(warned.code, 0, warned.stderr);
    assert.match(
      warned.stderr,
      /compass-first: 0 Compass evidence call\(s\) in stage "exploring" \(compassGate: warn\)/,
    );
    const out = JSON.parse(warned.stdout) as HarnessAdvanceResult;
    assert.equal(out.stage, "planning");
    assert.equal(out.compassEvidence?.calls, 0);

    seed(root, "exploring", [started], "compassGate: strict");
    const before = read(root, "lawbook/changes/feat/harness.json");
    const rejected = runCli(["cortex", "advance", "--change", "feat"], { cwd: root });
    assert.equal(rejected.code, 1);
    assert.match(rejected.stderr, /compass-first: cannot leave stage "exploring"/);
    assert.match(rejected.stderr, /compassGate/);
    assert.equal(read(root, "lawbook/changes/feat/harness.json"), before);
  },
);

test(
  "CLI cortex advance prints the evidence count on stderr when the gate is satisfied",
  { skip: cliBuilt() ? false : "dist/ not built — run `npm run build` first" },
  (t) => {
    const root = tmpRepo(t);
    seed(root, "exploring", [started], "compassGate: strict");
    recordCompassCall(root, "compass_explore", at(5));
    recordCompassCall(root, "compass_find", at(6));
    const r = runCli(["cortex", "advance", "--change", "feat"], { cwd: root });
    assert.equal(r.code, 0, r.stderr);
    assert.match(
      r.stderr,
      /2 Compass evidence call\(s\) in stage "exploring" \(compassGate: strict\)/,
    );
    assert.doesNotMatch(r.stderr, /!/);
    assert.equal((JSON.parse(r.stdout) as HarnessAdvanceResult).compassEvidence?.calls, 2);
  },
);
