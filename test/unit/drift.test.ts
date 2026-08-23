import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { SCHEMA_VERSION, openDb, indexPath, needsReindex } from "../../src/modules/compass/db.js";
import { NORMALIZER_VERSION } from "../../src/modules/compass/hash.js";
import {
  sealCapability,
  writeAnchorsFile,
  type AnchorRecord,
} from "../../src/modules/lawbook/anchors.js";
import {
  buildDriftReport,
  classifyAnchor,
  driftExitCode,
  loadCapabilityPaths,
  parseFailOn,
} from "../../src/modules/lawbook/drift.js";

test("parseFailOn defaults to semantic and rejects junk", () => {
  assert.equal(parseFailOn(undefined), "semantic");
  assert.equal(parseFailOn(true), "semantic");
  assert.equal(parseFailOn("cosmetic"), "cosmetic");
  assert.equal(parseFailOn("nope"), null);
});

test("loadCapabilityPaths reads capabilities[].paths", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "lawbook/config.yaml",
    `capabilities:\n  - name: cli\n    paths:\n      - src/cli/**\n`,
  );
  assert.deepEqual(loadCapabilityPaths(root), { cli: ["src/cli/**"] });
});

test("classifyAnchor: cosmetic vs semantic vs moved", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function alpha(): number {\n  return 1;\n}\n`);
  await buildIndex(root);
  sealCapability(root, "demo", `### Requirement: A\n\n\`alpha\`\n`);

  let db = openDb(root);
  const row = db
    .prepare(
      `SELECT n.norm_hash AS norm, n.body_hash AS body, f.path AS path
         FROM nodes n JOIN files f ON f.id = n.file_id WHERE n.name = 'alpha'`,
    )
    .get() as { norm: string; body: string; path: string };
  const base: AnchorRecord = {
    specId: "demo",
    requirementId: "a",
    scenarioId: "",
    anchorKind: "symbol",
    symbolName: "alpha",
    filePath: row.path,
    resolution: "unique",
    contentHash: row.norm,
    rawHash: row.body,
    archivedAt: new Date().toISOString(),
    commitSha: null,
    source: "backtick",
    normalizerVersion: NORMALIZER_VERSION,
  };
  assert.equal(classifyAnchor(db, root, "demo", base).state, "unchanged");
  db.close();

  write(root, "src/a.ts", `export function alpha(): number {\n  // fmt\n  return 1;\n}\n`);
  await buildIndex(root);
  db = openDb(root);
  assert.equal(classifyAnchor(db, root, "demo", base).state, "changed-cosmetic");
  db.close();

  write(root, "src/a.ts", `export function alpha(): number {\n  return 99;\n}\n`);
  await buildIndex(root);
  db = openDb(root);
  assert.equal(classifyAnchor(db, root, "demo", base).state, "changed-semantic");
  db.close();

  write(root, "src/b.ts", `export function alpha(): number {\n  return 99;\n}\n`);
  fs.unlinkSync(path.join(root, "src/a.ts"));
  await buildIndex(root);
  db = openDb(root);
  const movedNorm = db
    .prepare(`SELECT n.norm_hash AS norm, n.body_hash AS body FROM nodes n WHERE n.name = 'alpha'`)
    .get() as { norm: string; body: string };
  const moved = classifyAnchor(db, root, "demo", {
    ...base,
    contentHash: movedNorm.norm,
    rawHash: movedNorm.body,
    filePath: "src/a.ts",
  });
  assert.equal(moved.state, "moved");
  assert.equal(moved.currentFile, "src/b.ts");
  db.close();
});

test("driftExitCode: semantic fails semantic threshold; cosmetic does not", () => {
  const mk = (state: "changed-cosmetic" | "changed-semantic") => ({
    capability: "c",
    anchor: {
      specId: "c",
      requirementId: "",
      scenarioId: "",
      anchorKind: "symbol" as const,
      symbolName: "x",
      filePath: "a.ts",
      resolution: "unique" as const,
      contentHash: "n",
      rawHash: "r",
      archivedAt: new Date().toISOString(),
      commitSha: null,
      source: "backtick" as const,
      normalizerVersion: NORMALIZER_VERSION,
    },
    state,
  });
  assert.equal(driftExitCode([mk("changed-cosmetic")], "semantic"), 0);
  assert.equal(driftExitCode([mk("changed-semantic")], "semantic"), 1);
  assert.equal(driftExitCode([mk("changed-cosmetic")], "cosmetic"), 1);
  const orphan = { ...mk("changed-cosmetic"), state: "orphan" as const };
  assert.equal(driftExitCode([orphan], "semantic"), 0);
  assert.equal(driftExitCode([orphan], "any"), 1);
});

test("buildDriftReport exits 2 when index is missing", (t) => {
  const root = tmpRepo(t);
  writeAnchorsFile(root, {
    anchorsVersion: 1,
    capability: "demo",
    normalizerVersion: NORMALIZER_VERSION,
    anchors: [],
  });
  const report = buildDriftReport(root, { failOn: "semantic" });
  assert.equal(report.summary.exitCode, 2);
  assert.equal(report.needsReindex, true);
});

test("schema 5 open under schema 6 sets needs-reindex and rehydrates anchors", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function alpha(): number { return 1; }\n`);
  await buildIndex(root);
  sealCapability(root, "demo", `### Requirement: A\n\n\`alpha\`\n`);

  const raw = new DatabaseSync(indexPath(root));
  raw.prepare("UPDATE meta SET value = '5' WHERE key = 'schema_version'").run();
  raw.close();

  const db = openDb(root);
  assert.equal(
    (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string })
      .value,
    SCHEMA_VERSION,
  );
  assert.equal(needsReindex(db), true);
  const anchors = db.prepare("SELECT COUNT(*) AS n FROM spec_anchors").get() as { n: number };
  assert.ok(anchors.n >= 1, "committed JSON rehydrates into spec_anchors after wipe");
  db.close();
});

test("sibling edit does not drift the sealed anchor", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/a.ts",
    `export function alpha(): number { return 1; }\nexport function beta(): number { return 2; }\n`,
  );
  await buildIndex(root);
  sealCapability(root, "demo", `### Requirement: A\n\n\`alpha\`\n`);

  write(
    root,
    "src/a.ts",
    `export function alpha(): number { return 1; }\nexport function beta(): number { return 99; }\n`,
  );
  await buildIndex(root);
  const report = buildDriftReport(root, { failOn: "semantic" });
  const v = report.verdicts.find((x) => x.anchor.symbolName === "alpha");
  assert.ok(v);
  assert.equal(v!.state, "unchanged");
  assert.equal(report.summary.exitCode, 0);
});
