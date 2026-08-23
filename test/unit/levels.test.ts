import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_THRESHOLDS,
  artifactNeeds,
  levelFromScore,
  proposeLevel,
  scoreSignals,
  setCeremonyLevel,
  promoteCeremonyLevel,
  confirmedLevel,
  type CeremonySignals,
} from "../../src/modules/lawbook/levels.js";
import { tmpRepo, write } from "../helpers/env.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { scaffoldQuick } from "../../src/modules/lawbook/quick.js";

function sig(partial: Partial<CeremonySignals>): CeremonySignals {
  return {
    filesTouched: 0,
    modulesTouched: 0,
    blastRadiusNodes: 0,
    affectedTests: 0,
    touchesPublicApi: false,
    maxHotspotScore: 0,
    touchesGlobalFile: false,
    onlyDocs: false,
    degraded: [],
    ...partial,
  };
}

const cases: Array<{ name: string; s: CeremonySignals; expect: number | null }> = [
  { name: "empty", s: sig({}), expect: 0 },
  { name: "one file small", s: sig({ filesTouched: 1, modulesTouched: 1 }), expect: 0 },
  { name: "onlyDocs", s: sig({ filesTouched: 3, onlyDocs: true }), expect: 0 },
  {
    name: "public api",
    s: sig({ filesTouched: 1, modulesTouched: 1, touchesPublicApi: true }),
    expect: 1,
  },
  {
    name: "global file",
    s: sig({ filesTouched: 1, modulesTouched: 1, touchesGlobalFile: true }),
    expect: 1,
  },
  {
    name: "hotspot floor",
    s: sig({ filesTouched: 1, modulesTouched: 1, maxHotspotScore: 0.8 }),
    expect: 1,
  },
  {
    name: "many files",
    s: sig({ filesTouched: 12, modulesTouched: 5, blastRadiusNodes: 20, affectedTests: 20 }),
    expect: 3,
  },
  {
    name: "mid blast",
    s: sig({ filesTouched: 4, modulesTouched: 2, blastRadiusNodes: 12, affectedTests: 5 }),
    expect: 2,
  },
  {
    name: "degraded no-index no files",
    s: sig({ degraded: ["no-index"] }),
    expect: null,
  },
  {
    name: "unresolved only",
    s: sig({ degraded: ["unresolved-symbols"] }),
    expect: null,
  },
  { name: "two modules", s: sig({ filesTouched: 2, modulesTouched: 2 }), expect: 1 },
  {
    name: "public+files",
    s: sig({ filesTouched: 5, modulesTouched: 3, touchesPublicApi: true, affectedTests: 4 }),
    expect: 2,
  },
  {
    name: "docs false with code",
    s: sig({ filesTouched: 1, modulesTouched: 1, onlyDocs: false }),
    expect: 0,
  },
  {
    name: "huge affected",
    s: sig({ filesTouched: 2, modulesTouched: 1, affectedTests: 40 }),
    expect: 1,
  },
  {
    name: "big modules",
    s: sig({ filesTouched: 6, modulesTouched: 6, blastRadiusNodes: 3 }),
    expect: 2,
  },
  {
    name: "hotspot below floor",
    s: sig({ filesTouched: 1, modulesTouched: 1, maxHotspotScore: 0.2 }),
    expect: 0,
  },
  {
    name: "global+hotspot",
    s: sig({
      filesTouched: 2,
      modulesTouched: 1,
      touchesGlobalFile: true,
      maxHotspotScore: 1,
    }),
    expect: 2,
  },
  {
    name: "level1 band",
    s: sig({ filesTouched: 3, modulesTouched: 2, affectedTests: 4, blastRadiusNodes: 5 }),
    expect: 1,
  },
  {
    name: "level2 band",
    s: sig({
      filesTouched: 4,
      modulesTouched: 3,
      affectedTests: 10,
      blastRadiusNodes: 15,
      touchesPublicApi: true,
    }),
    expect: 3,
  },
  {
    name: "onlyDocs ignores blast",
    s: sig({ filesTouched: 10, blastRadiusNodes: 100, onlyDocs: true }),
    expect: 0,
  },
];

test("score/level table covers ≥20 combinations", () => {
  assert.ok(cases.length >= 20);
  for (const c of cases) {
    const p = proposeLevel(c.s, DEFAULT_THRESHOLDS);
    assert.equal(p.level, c.expect, `${c.name}: score=${p.score} rationale=${p.rationale}`);
  }
});

test("levelFromScore respects cuts", () => {
  assert.equal(levelFromScore(0), 0);
  assert.equal(levelFromScore(3), 1);
  assert.equal(levelFromScore(8), 2);
  assert.equal(levelFromScore(15), 3);
});

test("artifactNeeds matrix", () => {
  assert.equal(artifactNeeds(0).deltaSpecs, false);
  assert.equal(artifactNeeds(0).proposal, false);
  assert.equal(artifactNeeds(1).tasksFile, true);
  assert.equal(artifactNeeds(2).designOptionalWithJustification, true);
  assert.equal(artifactNeeds(3).design, true);
});

test("setCeremonyLevel rejects silent downgrade", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  write(root, "lawbook/changes/c/record.md", "# c\n");
  const proposal = proposeLevel(
    sig({ filesTouched: 12, modulesTouched: 5, blastRadiusNodes: 40, affectedTests: 20 }),
  );
  assert.equal(proposal.level, 3);
  assert.throws(() =>
    setCeremonyLevel(root, "c", {
      proposal,
      level: 1,
      confirmedBy: "human",
    }),
  );
  setCeremonyLevel(root, "c", {
    proposal,
    level: 1,
    confirmedBy: "human",
    reason: "hotfix",
  });
  assert.equal(confirmedLevel(root, "c"), 1);
});

test("promote scaffolds artifacts and keeps record.md", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const q = scaffoldQuick(root, "tiny");
  promoteCeremonyLevel(root, "tiny", 2, "scope grew");
  assert.equal(confirmedLevel(root, "tiny"), 2);
  assert.ok(fs.existsSync(path.join(q.dir, "record.md")));
  assert.ok(fs.existsSync(path.join(q.dir, "proposal.md")));
  assert.ok(fs.existsSync(path.join(q.dir, "tasks.md")));
});

test("scoreSignals onlyDocs short-circuits", () => {
  assert.equal(scoreSignals(sig({ filesTouched: 99, onlyDocs: true })), 0);
});
