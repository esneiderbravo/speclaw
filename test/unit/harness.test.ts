import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { handleHarness, harnessArchiveBlockers } from "../../src/modules/cortex/harness.js";
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
  });

  const started = handleHarness({ projectPath: root, change: "feat", harnessOp: "start" });
  assert.equal((started as { stage: string }).stage, "exploring");
  assert.ok(has(root, "lawbook/changes/feat/harness.json"));

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
  assert.equal(briefForStage("done").role, null);
  assert.equal(briefForStage(null).role, null);
});
