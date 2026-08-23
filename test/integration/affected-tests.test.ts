import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { affectedTests } from "../../src/modules/compass/affected.js";
import { impact } from "../../src/modules/compass/query.js";
import { SCHEMA_VERSION, openDb, needsReindex } from "../../src/modules/compass/db.js";

test("schema 7 stamps is_test and module on files", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): void {}\n`);
  write(root, "src/a.test.ts", `export function t(): void {}\n`);
  await buildIndex(root);
  const db = openDb(root);
  const ver = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(ver.value, SCHEMA_VERSION);
  const rows = db.prepare("SELECT path, is_test, module FROM files ORDER BY path").all() as Array<{
    path: string;
    is_test: number;
    module: string;
  }>;
  db.close();
  const testRow = rows.find((r) => r.path.endsWith("a.test.ts"))!;
  const srcRow = rows.find((r) => r.path === "src/a.ts")!;
  assert.equal(testRow.is_test, 1);
  assert.equal(srcRow.is_test, 0);
  assert.ok(srcRow.module.length > 0);
});

test("opening a schema-6 stamped db forces reindex marker", (t) => {
  const root = tmpRepo(t);
  // Create a minimal schema-6 shaped db by opening then rewriting meta.
  write(root, "src/a.ts", `export function a(): void {}\n`);
  const db = openDb(root);
  db.prepare("UPDATE meta SET value = '6' WHERE key = 'schema_version'").run();
  // Drop new columns to simulate old files table
  db.close();

  // Re-open: isStale should wipe because version !== 7
  const db2 = openDb(root);
  assert.equal(needsReindex(db2), true);
  const ver = db2.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(ver.value, SCHEMA_VERSION);
  db2.close();
});

test("affected-tests --from-diff seeds from git changed files", async (t) => {
  const root = tmpRepo(t);
  spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root });
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(
    root,
    "src/lib.ts",
    `export function add(a: number, b: number): number { return a + b; }\n`,
  );
  write(
    root,
    "src/lib.test.ts",
    `import { add } from "./lib.js";\nexport function testAdd(): number { return add(1, 2); }\n`,
  );
  write(root, "src/other.ts", `export function noop(): void {}\n`);
  write(root, "src/other.test.ts", `export function t(): void {}\n`);
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["commit", "-m", "init"], { cwd: root });
  spawnSync("git", ["branch", "-M", "main"], { cwd: root });

  // Change lib.ts on a feature branch tip vs main: amend working tree after commit
  write(
    root,
    "src/lib.ts",
    `export function add(a: number, b: number): number { return a + b + 1; }\n`,
  );
  spawnSync("git", ["add", "src/lib.ts"], { cwd: root });
  spawnSync("git", ["commit", "-m", "change"], { cwd: root });

  await buildIndex(root);
  // changedFiles(main) from HEAD after second commit should include lib.ts
  // Create an orphan parent: use HEAD~1 as base
  const res = affectedTests(root, { fromDiff: "HEAD~1" });
  assert.ok(
    res.tests.some((x) => x.file.endsWith("lib.test.ts")),
    JSON.stringify(res),
  );
});

test("build target empties for test-only change", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): void {}\n`);
  write(root, "src/a.test.ts", `export function t(): void {}\n`);
  await buildIndex(root);
  const res = impact(root, { files: ["src/a.test.ts"], target: "build" });
  assert.equal(res.totals.nodes, 0);
  assert.ok(res.warnings.some((w) => /target "build"/i.test(w) || /other targets/i.test(w)));
});

test("unindexed language warns", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): void {}\n`);
  write(root, "src/a.test.ts", `export function t(): void {}\n`);
  write(root, "cmd/main.go", `package main\nfunc main() {}\n`);
  await buildIndex(root);
  const res = affectedTests(root, { files: ["src/a.ts"] });
  assert.ok(res.warnings.some((w) => w.includes(".go")));
});
