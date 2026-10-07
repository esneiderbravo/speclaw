import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { archiveFs, specArchive, specInit } from "../../src/modules/lawbook/engine.js";
import {
  completeHarnessOnArchive,
  handleHarness,
  harnessArchiveBlockers,
  readHarness,
  resolveChangeDir,
} from "../../src/modules/cortex/harness.js";
import { briefForStage } from "../../src/modules/cortex/brief.js";

function seedMinimal(root: string, name: string, level = 2): void {
  write(root, `lawbook/changes/${name}/proposal.md`, "# p\n");
  write(root, `lawbook/changes/${name}/tasks.md`, "- [x] x\n");
  write(
    root,
    `lawbook/changes/${name}/change.json`,
    JSON.stringify({
      confirmedLevel: level,
      confirmedBy: "human",
      confirmedAt: new Date().toISOString(),
      level,
      score: 0,
      signals: {},
      rationale: "test",
      degraded: [],
      promotions: [],
    }),
  );
}

// Covers: req~harness-state~1
test("harness start/status/advance and rejects illegal jumps", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedMinimal(root, "feat");

  assert.deepEqual(handleHarness({ projectPath: root, change: "feat", harnessOp: "status" }), {
    state: null,
    summary: null,
  });

  const started = handleHarness({ projectPath: root, change: "feat", harnessOp: "start" });
  assert.equal((started as { stage: string }).stage, "exploring");
  assert.ok(has(root, "lawbook/changes/feat/harness.json"));

  const status = handleHarness({ projectPath: root, change: "feat", harnessOp: "status" }) as {
    state: { stage: string } | null;
    summary: { stage: string; role: string; tasks: unknown; elapsedMinutes: number } | null;
  };
  assert.equal(status.state?.stage, "exploring");
  assert.equal(status.summary?.stage, "exploring");
  assert.equal(status.summary?.role, "explorer");
  assert.deepEqual(status.summary?.tasks, { done: 1, total: 1 });
  assert.equal(status.summary?.elapsedMinutes, 0);

  assert.throws(
    () => handleHarness({ projectPath: root, change: "feat", harnessOp: "start" }),
    /already started/,
  );

  const afterExplore = handleHarness({
    projectPath: root,
    change: "feat",
    harnessOp: "advance",
  }) as { stage: string };
  assert.equal(afterExplore.stage, "planning");

  assert.throws(
    () =>
      handleHarness({
        projectPath: root,
        change: "feat",
        harnessOp: "rework",
        verdict: "FAIL",
      }),
    /only allowed from reviewing or testing/,
  );

  handleHarness({
    projectPath: root,
    change: "feat",
    harnessOp: "advance",
    pauseForQuestions: true,
    openQuestions: ["Which API shape?"],
  });
  const paused = JSON.parse(read(root, "lawbook/changes/feat/harness.json"));
  assert.equal(paused.stage, "questions");
  assert.deepEqual(paused.openQuestions, ["Which API shape?"]);

  const back = handleHarness({
    projectPath: root,
    change: "feat",
    harnessOp: "advance",
  }) as { stage: string; openQuestions: string[] };
  assert.equal(back.stage, "planning");
  assert.deepEqual(back.openQuestions, []);
});

test("harness rework increments iteration and caps at maxRework", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedMinimal(root, "feat");
  handleHarness({ projectPath: root, change: "feat", harnessOp: "start" });
  // exploring → planning → implementing → reviewing
  handleHarness({ projectPath: root, change: "feat", harnessOp: "advance" });
  handleHarness({ projectPath: root, change: "feat", harnessOp: "advance" });
  handleHarness({ projectPath: root, change: "feat", harnessOp: "advance" });

  for (let i = 0; i < 3; i++) {
    const state = handleHarness({
      projectPath: root,
      change: "feat",
      harnessOp: "rework",
      verdict: "FAIL",
    }) as { stage: string; iteration: number };
    assert.equal(state.stage, "implementing");
    assert.equal(state.iteration, i + 1);
    // back to reviewing for next rework
    handleHarness({ projectPath: root, change: "feat", harnessOp: "advance" });
  }

  assert.throws(
    () =>
      handleHarness({
        projectPath: root,
        change: "feat",
        harnessOp: "rework",
        verdict: "FAIL",
      }),
    /max rework/,
  );
});

test("level 0 skips planning and review on advance", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedMinimal(root, "tiny", 0);
  handleHarness({ projectPath: root, change: "tiny", harnessOp: "start" });
  const afterExplore = handleHarness({
    projectPath: root,
    change: "tiny",
    harnessOp: "advance",
  }) as { stage: string };
  assert.equal(afterExplore.stage, "implementing");
  const afterImpl = handleHarness({
    projectPath: root,
    change: "tiny",
    harnessOp: "advance",
  }) as { stage: string };
  assert.equal(afterImpl.stage, "testing");
});

// Covers: req~harness-archive-gate~1
test("harnessArchiveBlockers require verdicts and stage", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedMinimal(root, "feat");
  assert.ok(harnessArchiveBlockers(root, "feat").some((b) => /missing harness/.test(b)));

  handleHarness({ projectPath: root, change: "feat", harnessOp: "start" });
  assert.ok(harnessArchiveBlockers(root, "feat").some((b) => /test verdict/.test(b)));
  assert.ok(harnessArchiveBlockers(root, "feat").some((b) => /review verdict/.test(b)));
});

test("briefForStage maps stages to roles", () => {
  assert.equal(briefForStage("exploring").role, "explorer");
  assert.deepEqual(briefForStage("exploring").skillHints, ["explore"]);
  assert.equal(briefForStage("implementing").role, "implementer");
  assert.deepEqual(briefForStage("archiving").skillHints, ["sync", "archive"]);
  // Archive completes the harness; no Cortex op follows it.
  assert.deepEqual(briefForStage("archiving").nextOps, []);
  assert.equal(briefForStage("done").role, null);
  assert.equal(briefForStage(null).role, null);
});

/** A level-2 change at stage `archiving` with review and test PASS, ready to archive. */
function seedArchiving(root: string, name: string): void {
  seedMinimal(root, name);
  write(root, `lawbook/changes/${name}/reports/backend.md`, "# backend\nok\n");
  write(
    root,
    `lawbook/changes/${name}/harness.json`,
    JSON.stringify(
      {
        version: 1,
        change: name,
        stage: "archiving",
        level: 2,
        iteration: 0,
        maxRework: 3,
        verdicts: { review: "PASS", test: "PASS" },
        openQuestions: [],
        history: [],
      },
      null,
      2,
    ) + "\n",
  );
}

// Covers: req~harness-archive-completes~1
test("archive completes the harness and status reads the archived change", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedArchiving(root, "feat");
  specArchive(root, "feat", "2026-10-06");
  const status = handleHarness({ projectPath: root, change: "feat", harnessOp: "status" }) as {
    state: { stage: string; history: Array<{ from: string; to: string; op: string }> } | null;
  };
  assert.equal(status.state?.stage, "done");
  const last = status.state!.history.at(-1)!;
  assert.deepEqual([last.from, last.to, last.op], ["archiving", "done", "advance"]);
});

// Covers: req~harness-archive-completes~1
test("the archive result reports harnessCompleted and brief reads the archived change", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedArchiving(root, "feat");
  const res = specArchive(root, "feat", "2026-10-06");
  assert.equal(res.harnessCompleted, true);
  const archived = "lawbook/changes/archive/2026-10-06-feat/harness.json";
  assert.equal(JSON.parse(read(root, archived)).stage, "done");
  assert.equal(readHarness(root, "feat")?.stage, "done");
  const status = handleHarness({ projectPath: root, change: "feat", harnessOp: "status" }) as {
    summary: { tasks: unknown } | null;
  };
  assert.deepEqual(status.summary?.tasks, { done: 1, total: 1 }, "tasks counted in the archive");
});

// Covers: req~harness-archive-completes~1
test("mutating ops on an archived change are rejected without writing", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedArchiving(root, "feat");
  specArchive(root, "feat", "2026-10-06");
  const archived = "lawbook/changes/archive/2026-10-06-feat/harness.json";
  const before = read(root, archived);
  for (const harnessOp of ["advance", "rework", "start"] as const) {
    assert.throws(
      () => handleHarness({ projectPath: root, change: "feat", harnessOp, verdict: "FAIL" }),
      /archived \(lawbook\/changes\/archive\/2026-10-06-feat\); Cortex ops are read-only/,
    );
  }
  assert.equal(read(root, archived), before);
  assert.ok(!has(root, "lawbook/changes/feat"));
});

// Covers: req~harness-archive-completes~1
test("the newest exact archive wins when resolving a change", (t) => {
  const root = tmpRepo(t);
  for (const d of ["2026-01-01-feat", "2026-02-01-feat", "2026-03-01-other-feat"]) {
    write(root, `lawbook/changes/archive/${d}/tasks.md`, "- [x] x\n");
  }
  const r = resolveChangeDir(root, "feat");
  assert.equal(r?.archived, true);
  assert.equal(path.basename(r!.dir), "2026-02-01-feat");
  assert.equal(resolveChangeDir(root, "missing"), null);
  write(root, "lawbook/changes/feat/tasks.md", "- [ ] x\n");
  assert.equal(resolveChangeDir(root, "feat")?.archived, false, "an active change wins");
});

// Covers: req~harness-archive-completes~1
test("completeHarnessOnArchive leaves a missing or done harness untouched", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedMinimal(root, "bare");
  assert.throws(() => specArchive(root, "bare", "2026-10-06"), /missing harness\.json/);
  assert.equal(completeHarnessOnArchive(root, "bare", "n").completed, false);
  assert.ok(!has(root, "lawbook/changes/bare/harness.json"), "no harness is created");

  seedArchiving(root, "fin");
  const p = "lawbook/changes/fin/harness.json";
  write(root, p, read(root, p).replace('"archiving"', '"done"'));
  const before = read(root, p);
  assert.equal(completeHarnessOnArchive(root, "fin", "n").completed, false);
  assert.equal(read(root, p), before);
  const res = specArchive(root, "fin", "2026-10-06");
  assert.equal(res.harnessCompleted, false);
  assert.equal(read(root, "lawbook/changes/archive/2026-10-06-fin/harness.json"), before);

  seedMinimal(root, "early");
  handleHarness({ projectPath: root, change: "early", harnessOp: "start" });
  assert.throws(() => completeHarnessOnArchive(root, "early", "n"), /advance to archiving/);
});

// Covers: req~harness-archive-completes~1
test("a failed directory move restores the harness bytes", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedArchiving(root, "feat");
  const p = "lawbook/changes/feat/harness.json";
  const before = read(root, p);
  const real = archiveFs.renameSync;
  archiveFs.renameSync = () => {
    throw new Error("EXDEV: simulated move failure");
  };
  try {
    assert.throws(() => specArchive(root, "feat", "2026-10-06"), /simulated move failure/);
  } finally {
    archiveFs.renameSync = real;
  }
  assert.equal(read(root, p), before);
});

const ASSETS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/lawbook/assets",
);

// Covers: req~harness-archive-completes~1
test("the shipped skill and archiver agent do not advance after archive", () => {
  for (const rel of ["skills/cortex/steps/02-dispatch-loop.md", "agents/archiver.md"]) {
    const body = fs.readFileSync(path.join(ASSETS, rel), "utf8").replace(/\s+/g, " ");
    assert.doesNotMatch(body, /archiving success → `advance`/, rel);
    assert.doesNotMatch(body, /Advance Cortex to `done`/, rel);
    assert.match(body, /`status`[^.]*stage is `done`/, rel);
    assert.match(body, /harnessCompleted/, rel);
  }
});
