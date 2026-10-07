import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { SCHEMA_VERSION, openDb, needsReindex } from "../../src/modules/compass/db.js";
import { hotspots, coupling } from "../../src/modules/compass/hotspots.js";

const cli = path.join(process.cwd(), "dist/cli/index.js");

test("schema 9 creates node_metrics and reindexes from 7", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): void {}\n`);
  await buildIndex(root);
  const db = openDb(root);
  assert.equal(
    (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string })
      .value,
    SCHEMA_VERSION,
  );
  assert.ok(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='node_metrics'").get(),
  );
  db.prepare("UPDATE meta SET value = '7' WHERE key = 'schema_version'").run();
  db.close();

  const db2 = openDb(root);
  assert.equal(needsReindex(db2), true);
  assert.equal(
    (db2.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string })
      .value,
    SCHEMA_VERSION,
  );
  db2.close();
});

test("CLI hotspots and coupling emit JSON without branded header", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  write(root, "src/a.ts", `export function a(): number { return 1; }\n`);
  write(root, "src/b.ts", `export function b(): number { return 2; }\n`);
  commit(root, "c1", [
    { path: "src/a.ts", content: "export function a(): number { return 1; }\n" },
    { path: "src/b.ts", content: "export function b(): number { return 2; }\n" },
  ]);
  commit(root, "c2", [
    { path: "src/a.ts", content: "export function a(): number { return 3; }\n" },
    { path: "src/b.ts", content: "export function b(): number { return 4; }\n" },
  ]);
  await buildIndex(root);

  const hs = spawnSync(process.execPath, [cli, "hotspots", "--json", "--days", "3650"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  assert.equal(hs.status, 0, hs.stderr);
  assert.ok(!hs.stdout.includes("Where specs become law"));
  const hot = JSON.parse(hs.stdout) as { window: { days: number }; hotspots: unknown[] };
  assert.equal(hot.window.days, 3650);
  assert.ok(Array.isArray(hot.hotspots));

  const cp = spawnSync(
    process.execPath,
    [cli, "coupling", "src/a.ts", "--json", "--days", "3650"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
  assert.equal(cp.status, 0, cp.stderr);
  assert.ok(!cp.stdout.includes("Where specs become law"));
  const coup = JSON.parse(cp.stdout) as { partners: unknown[] };
  assert.ok(Array.isArray(coup.partners));

  // API-level smoke on the same fixture
  const report = hotspots(root, { days: 3650 });
  assert.ok(report.hotspots.length >= 1);
  const couple = coupling(root, "src/a.ts", { days: 3650, minShared: 2 });
  assert.ok(couple.partners.some((p) => p.file === "src/b.ts"));
});

// Covers: req~impact-id-first~1
test("coupling in_graph ignores member and builtin calls in its by-name fallback", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  const parser = (v: number): string =>
    `export function parse(s: string): number { return ${v}; }\nexport function test(): number { return ${v}; }\n`;
  const use = (v: number): string =>
    `import path from "node:path";
export function pick(p: string, items: { parse(s: string): unknown }): unknown {
  test("x", () => {});
  return [path.parse(p), items.parse(p), ${v}];
}
`;
  const own = (v: number): string =>
    `import { parse } from "./parser.js";\nexport function mine(): number { return parse("s") + ${v}; }\n`;
  for (const [msg, v] of [
    ["c1", 1],
    ["c2", 2],
  ] as const) {
    commit(root, msg, [
      { path: "src/parser.ts", content: parser(v) },
      { path: "src/use.ts", content: use(v) },
      { path: "src/own.ts", content: own(v) },
    ]);
  }
  await buildIndex(root);
  const couple = coupling(root, "src/parser.ts", { days: 3650, minShared: 2 });
  const inGraph = new Map(couple.partners.map((p) => [p.file, p.inGraph]));
  assert.equal(inGraph.get("src/own.ts"), true, JSON.stringify(couple.partners));
  assert.equal(inGraph.get("src/use.ts"), false, JSON.stringify(couple.partners));
});
