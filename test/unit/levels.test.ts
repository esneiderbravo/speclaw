import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_THRESHOLDS,
  artifactNeeds,
  levelFromScore,
  proposeLevel,
  scoreSignals,
  setCeremonyLevel,
  promoteCeremonyLevel,
  confirmedLevel,
  gatherSignals,
  type CeremonySignals,
} from "../../src/modules/lawbook/levels.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { tmpRepo, write } from "../helpers/env.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { scaffoldQuick, handleLevel } from "../../src/modules/lawbook/quick.js";
import { scaffoldBugfix } from "../../src/modules/lawbook/bugfix.js";

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
    expect: 0,
  },
  {
    name: "many files",
    s: sig({ filesTouched: 12, modulesTouched: 5, blastRadiusNodes: 20, affectedTests: 20 }),
    expect: 2,
  },
  {
    name: "mid blast",
    s: sig({ filesTouched: 4, modulesTouched: 2, blastRadiusNodes: 12, affectedTests: 5 }),
    expect: 1,
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
  { name: "two modules", s: sig({ filesTouched: 2, modulesTouched: 2 }), expect: 0 },
  {
    name: "public+files",
    s: sig({ filesTouched: 5, modulesTouched: 3, touchesPublicApi: true, affectedTests: 4 }),
    expect: 1,
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
    expect: 1,
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
    expect: 1,
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
    expect: 2,
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
  assert.equal(levelFromScore(4), 0);
  assert.equal(levelFromScore(5), 1);
  assert.equal(levelFromScore(16), 2);
  assert.equal(levelFromScore(25), 3);
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
  assert.equal(proposal.level, 2);
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

/** An indexed project with three source files and an initialised lawbook. */
async function seedIndexed(root: string): Promise<string[]> {
  specInit(root);
  const paths = ["src/a.ts", "src/b.ts", "src/c.ts"];
  write(root, paths[0]!, "export function a(): number { return 1; }\n");
  write(
    root,
    paths[1]!,
    'import { a } from "./a.js";\nexport function b(): number { return a(); }\n',
  );
  write(
    root,
    paths[2]!,
    'import { b } from "./b.js";\nexport function c(): number { return b(); }\n',
  );
  await buildIndex(root);
  return paths;
}

type StoredRecord = {
  level: number | null;
  score: number;
  signals: CeremonySignals;
  rationale: string;
  degraded: string[];
  confirmedLevel: number;
  promotions: Array<{ from: number; to: number }>;
};

function stored(root: string, change: string): StoredRecord {
  return JSON.parse(
    fs.readFileSync(path.join(root, "lawbook/changes", change, "change.json"), "utf8"),
  ) as StoredRecord;
}

// Covers: req~level-proposal-preserved~1
test("empty targets propose no level", async (t) => {
  const root = tmpRepo(t);
  await seedIndexed(root);
  const signals = gatherSignals(root, { paths: [], symbols: [] });
  assert.ok(signals.degraded.includes("no-targets" as never), JSON.stringify(signals));
  const { proposal } = handleLevel({ projectPath: root, mode: "propose" }) as {
    proposal: { level: number | null; score: number; degraded: string[] };
  };
  assert.equal(proposal.level, null);
  assert.equal(proposal.score, 0);
  assert.ok(proposal.degraded.includes("no-targets"));
});

// Covers: req~level-proposal-preserved~1
test("set and promote without targets keep the stored proposal", async (t) => {
  const root = tmpRepo(t);
  const paths = await seedIndexed(root);
  handleLevel({ projectPath: root, mode: "set", change: "c", paths, level: 1, reason: "test" });
  const measured = stored(root, "c");
  assert.equal(measured.signals.filesTouched, 3);

  handleLevel({ projectPath: root, mode: "set", change: "c", level: 2 });
  const afterSet = stored(root, "c");
  assert.equal(afterSet.confirmedLevel, 2);
  for (const k of ["level", "score", "signals", "rationale", "degraded"] as const) {
    assert.deepEqual(afterSet[k], measured[k], `set kept ${k}`);
  }

  handleLevel({ projectPath: root, mode: "promote", change: "c", level: 3 });
  const afterPromote = stored(root, "c");
  assert.equal(afterPromote.confirmedLevel, 3);
  assert.deepEqual(afterPromote.signals, measured.signals);
  assert.equal(afterPromote.score, measured.score);
  assert.deepEqual(
    afterPromote.promotions.map((p) => [p.from, p.to]),
    [[2, 3]],
  );

  handleLevel({ projectPath: root, mode: "set", change: "c", paths: [paths[0]!], level: 3 });
  assert.equal(stored(root, "c").signals.filesTouched, 1, "targets replace the stored proposal");
});

// Covers: req~level-proposal-preserved~1
test("set without targets and without a stored proposal stores the no-targets proposal", async (t) => {
  const root = tmpRepo(t);
  await seedIndexed(root);
  handleLevel({ projectPath: root, mode: "set", change: "fresh", level: 1 });
  const rec = stored(root, "fresh");
  assert.equal(rec.level, null);
  assert.ok(rec.degraded.includes("no-targets"));
  assert.equal(rec.confirmedLevel, 1);
});

// Covers: req~level-proposal-preserved~1
test("promote on a change with no confirmed level is rejected with use mode set", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldBugfix(root, "unconfirmed");
  const file = path.join(root, "lawbook/changes/unconfirmed/change.json");
  const before = fs.readFileSync(file, "utf8");
  assert.throws(
    () => handleLevel({ projectPath: root, mode: "promote", change: "unconfirmed", level: 3 }),
    /no confirmed level to promote — use mode 'set'/,
  );
  assert.equal(fs.readFileSync(file, "utf8"), before, "change.json is untouched");
});

test("a file counts as a hotspot only with real churn, not as the hottest of a young repo", async (t) => {
  const root = tmpRepo(t);
  const git = (...args: string[]) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await seedIndexed(root);
  git("add", "-A");
  git("commit", "-qm", "init");
  const young = gatherSignals(root, { paths: ["src/a.ts"], symbols: [] });
  assert.equal(young.maxHotspotScore, 0, JSON.stringify(young));

  for (let i = 2; i <= 4; i++) {
    write(root, "src/a.ts", `export function a(): number { return ${i}; }\n`);
    git("commit", "-qam", `a ${i}`);
  }
  const churned = gatherSignals(root, { paths: ["src/a.ts"], symbols: [] });
  assert.ok(churned.maxHotspotScore > 0, JSON.stringify(churned));
});
