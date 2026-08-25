import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { seedSampleRepo, SAMPLE_UTIL_TS } from "../helpers/fixtures.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { openDb } from "../../src/modules/compass/db.js";
import { getEmbedder } from "../../src/modules/compass/embedder.js";

test("no-op reindex reports rootUnchanged and zero computed", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const second = await buildIndex(root);
  assert.equal(second.computed, 0);
  assert.equal(second.rootUnchanged, true);
});

test("move symbol between files recomputes zero for that content hash", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/a.ts",
    `export function shared(): number {\n  return 1;\n}\nexport function keepA(): void {}\n`,
  );
  write(root, "src/b.ts", `export function keepB(): void {}\n`);
  await buildIndex(root);

  write(root, "src/a.ts", `export function keepA(): void {}\n`);
  write(
    root,
    "src/b.ts",
    `export function shared(): number {\n  return 1;\n}\nexport function keepB(): void {}\n`,
  );
  const stats = await buildIndex(root);
  assert.equal(stats.computed, 0, `expected 0 computed, got ${stats.computed}`);
  assert.ok(stats.fromCache >= 1);
});

test("returning to prior content recomputes nothing (checkout-like)", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);

  write(root, "src/util.ts", `export function helper(): number {\n  return 99;\n}\n`);
  await buildIndex(root);

  // Restore original util content (simulates checkout of prior tree).
  write(root, "src/util.ts", SAMPLE_UTIL_TS);
  const stats = await buildIndex(root);
  assert.equal(stats.computed, 0);
  assert.ok(stats.fromCache >= 1 || stats.skippedByStat >= 1 || stats.unchanged >= 1);
});

test("identical embedder inputs share one cache row", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/one.ts", `export function twin(): void {}\n`);
  write(root, "src/two.ts", `export function twin(): void {}\n`);
  const stats = await buildIndex(root);
  assert.ok(stats.computed >= 1);
  const db = openDb(root);
  const model = getEmbedder().id;
  const n = db
    .prepare(
      `SELECT COUNT(*) AS c FROM embedding_cache
       WHERE model = ? AND content_hash IN (
         SELECT content_hash FROM nodes WHERE name = 'twin'
       )`,
    )
    .get(model) as { c: number };
  assert.equal(n.c, 1);
  const viewRows = db
    .prepare(
      `SELECT COUNT(*) AS c FROM node_embeddings ne
       JOIN nodes n ON n.id = ne.node_id WHERE n.name = 'twin'`,
    )
    .get() as { c: number };
  assert.equal(viewRows.c, 2);
  db.close();
});

test("prune deletes orphan cache rows past retention", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): void {}\n`);
  await buildIndex(root);
  const db = openDb(root);
  const model = getEmbedder().id;
  const old = Date.now() - 60 * 24 * 60 * 60 * 1000;
  db.prepare(
    `INSERT INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at)
     VALUES ('orphan-hash', ?, 2, ?, ?, ?)`,
  ).run(model, Buffer.alloc(8), old, old);
  db.close();

  await buildIndex(root, { prune: true, retentionDays: 30 });
  const db2 = openDb(root);
  const gone = db2
    .prepare("SELECT 1 AS ok FROM embedding_cache WHERE content_hash = 'orphan-hash'")
    .get();
  assert.equal(gone, undefined);
  db2.close();
});

test("LRU eviction drops least-recently-seen when over size cap", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): void {}\n`);
  await buildIndex(root);
  const db = openDb(root);
  const model = getEmbedder().id;
  const big = Buffer.alloc(2 * 1024 * 1024, 1);
  db.prepare(
    `INSERT INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at)
     VALUES ('old-big', ?, 2, ?, 1, 1)`,
  ).run(model, big);
  db.prepare(
    `INSERT INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at)
     VALUES ('newer-big', ?, 2, ?, 2, 2)`,
  ).run(model, big);
  db.close();

  await buildIndex(root, { maxCacheMB: 3 });
  const db2 = openDb(root);
  const oldGone = db2
    .prepare("SELECT 1 AS ok FROM embedding_cache WHERE content_hash = 'old-big'")
    .get();
  assert.equal(oldGone, undefined);
  db2.close();
});

test("emptying a directory changes the root hash", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/only.ts", `export function only(): void {}\n`);
  await buildIndex(root);
  const db = openDb(root);
  const before = (
    db.prepare("SELECT hash FROM dir_hashes WHERE path = ''").get() as {
      hash: string;
    }
  ).hash;
  db.close();

  fs.rmSync(path.join(root, "src", "only.ts"));
  await buildIndex(root);
  const db2 = openDb(root);
  const after = (
    db2.prepare("SELECT hash FROM dir_hashes WHERE path = ''").get() as {
      hash: string;
    }
  ).hash;
  assert.notEqual(after, before);
  db2.close();
});
