import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, statSync } from "node:fs";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { seedSampleRepo, SAMPLE_UTIL_TS } from "../helpers/fixtures.js";
import { buildIndex, indexFiles } from "../../src/modules/compass/indexer.js";
import { openDb } from "../../src/modules/compass/db.js";
import { MAP_START, MAP_END } from "../../src/modules/compass/map.js";

// The no-op fast path: an unchanged project skips the global post-processing
// and leaves the tracked docs/compass.md alone. Writes to `dir_hashes`,
// `pagerank`, `edges`, and `embedding_cache` are detected with triggers in the
// scratch database, so "untouched" means no row was inserted, updated, or
// deleted — not merely equal contents.

const EMPTY_MAP = `# Compass\n\n${MAP_START}\n${MAP_END}\n\n## Project-specific starting points\n`;

/** Seed a sample project with an empty map block and build its first index. */
async function indexedProject(t: Parameters<typeof tmpRepo>[0]): Promise<string> {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  write(root, "docs/compass.md", EMPTY_MAP);
  await buildIndex(root);
  return root;
}

/** Install triggers that log every write to the post-processed tables. */
function watchWrites(root: string): void {
  const db = openDb(root);
  db.exec("CREATE TABLE IF NOT EXISTS write_log (tbl TEXT NOT NULL, op TEXT NOT NULL)");
  for (const tbl of ["dir_hashes", "pagerank", "edges", "embedding_cache"]) {
    for (const op of ["INSERT", "UPDATE", "DELETE"]) {
      db.exec(
        `CREATE TRIGGER IF NOT EXISTS log_${tbl}_${op} AFTER ${op} ON ${tbl}
         BEGIN INSERT INTO write_log(tbl, op) VALUES ('${tbl}', '${op}'); END`,
      );
    }
  }
  db.close();
}

/** The logged writes since {@link watchWrites}, as `table:op` strings. */
function loggedWrites(root: string): string[] {
  const db = openDb(root);
  const rows = db.prepare("SELECT tbl, op FROM write_log").all() as Array<{
    tbl: string;
    op: string;
  }>;
  db.exec("DELETE FROM write_log");
  db.close();
  return rows.map((r) => `${r.tbl}:${r.op}`);
}

function indexedAt(root: string): string {
  const db = openDb(root);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'indexed_at'").get() as {
    value: string;
  };
  db.close();
  return row.value;
}

const mapPath = (root: string): string => path.join(root, "docs", "compass.md");
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Covers: req~index-noop-fast-path~1
test("a no-op run leaves dir_hashes, pagerank, edges, the embedding cache, and the map untouched", async (t) => {
  const root = await indexedProject(t);
  const mapBefore = read(root, "docs/compass.md");
  assert.ok(mapBefore.length > EMPTY_MAP.length, "the first index fills the map block");
  const mtimeBefore = statSync(mapPath(root)).mtimeMs;
  const atBefore = indexedAt(root);
  watchWrites(root);
  await sleep(20);

  const stats = await buildIndex(root);

  assert.deepEqual(loggedWrites(root), []);
  assert.equal(read(root, "docs/compass.md"), mapBefore);
  assert.equal(statSync(mapPath(root)).mtimeMs, mtimeBefore);
  assert.ok(indexedAt(root) > atBefore, "indexed_at still advances");
  assert.equal(stats.rootUnchanged, true);
  assert.equal(stats.files, 0);
  assert.ok(stats.totals.files > 0 && stats.totals.nodes > 0 && stats.totals.edges > 0);
  assert.match(stats.nextStep, /compass_explore/);
});

test("force and prune bypass the no-op fast path", async (t) => {
  const root = await indexedProject(t);
  watchWrites(root);

  await buildIndex(root, { force: true });
  const forced = loggedWrites(root);
  assert.ok(forced.includes("dir_hashes:INSERT"), forced.join(","));
  assert.ok(forced.includes("pagerank:INSERT"), forced.join(","));
  // the edges trigger is live: a forced run rewrites edges, a no-op run does not
  assert.ok(
    forced.some((w) => w.startsWith("edges:")),
    forced.join(","),
  );

  const pruned = await buildIndex(root, { prune: true });
  assert.equal(pruned.files, 0, "prune alone re-extracts nothing");
  const prunedWrites = loggedWrites(root);
  assert.ok(prunedWrites.includes("dir_hashes:INSERT"), prunedWrites.join(","));
  assert.ok(prunedWrites.includes("pagerank:INSERT"), prunedWrites.join(","));
});

test("an explicit cache cap bypasses the no-op fast path", async (t) => {
  const root = await indexedProject(t);
  watchWrites(root);
  const stats = await buildIndex(root, { maxCacheMB: 256 });
  assert.equal(stats.files, 0);
  assert.ok(loggedWrites(root).includes("pagerank:INSERT"));
});

test("a changed file still runs the full pass and rewrites the map", async (t) => {
  const root = await indexedProject(t);
  const mtimeBefore = statSync(mapPath(root)).mtimeMs;
  watchWrites(root);
  await sleep(20);

  write(
    root,
    "src/util.ts",
    SAMPLE_UTIL_TS + "\nexport function added(): number {\n  return 2;\n}\n",
  );
  const stats = await buildIndex(root);

  assert.equal(stats.files, 1);
  assert.equal(stats.rootUnchanged, false);
  const writes = loggedWrites(root);
  assert.ok(writes.includes("pagerank:INSERT"), writes.join(","));
  assert.ok(writes.includes("dir_hashes:INSERT"), writes.join(","));
  assert.ok(statSync(mapPath(root)).mtimeMs > mtimeBefore, "the map is written");
});

// Covers: req~index-noop-fast-path~1
test("a pending per-file reindex forces the full pass, then the fast path returns", async (t) => {
  const root = await indexedProject(t);
  write(
    root,
    "src/util.ts",
    SAMPLE_UTIL_TS + "\nexport function added(): number {\n  return 2;\n}\n",
  );
  await indexFiles(root, ["src/util.ts"]);
  const marker = (): string | undefined => {
    const db = openDb(root);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'post_pending'").get() as
      { value: string } | undefined;
    db.close();
    return row?.value;
  };
  assert.equal(marker(), "1");
  const mtimeBefore = statSync(mapPath(root)).mtimeMs;
  watchWrites(root);
  await sleep(20);

  const stats = await buildIndex(root);

  // the per-file run already stored the new hashes: only the marker forces the pass
  assert.equal(stats.files, 0);
  const writes = loggedWrites(root);
  assert.ok(writes.includes("pagerank:INSERT"), writes.join(","));
  assert.ok(statSync(mapPath(root)).mtimeMs > mtimeBefore, "the map is written");
  assert.equal(marker(), undefined);

  const again = await buildIndex(root);
  assert.equal(again.rootUnchanged, true);
  assert.deepEqual(loggedWrites(root), []);
});

test("a removed file is not a no-op", async (t) => {
  const root = await indexedProject(t);
  watchWrites(root);
  rmSync(path.join(root, "src/greet.js"));
  const stats = await buildIndex(root);
  assert.equal(stats.removed, 1);
  assert.ok(loggedWrites(root).includes("dir_hashes:INSERT"));
});

test("an emptied map block is refilled on a no-op run", async (t) => {
  const root = await indexedProject(t);
  write(root, "docs/compass.md", EMPTY_MAP);
  const stats = await buildIndex(root);
  assert.equal(stats.rootUnchanged, true);
  const text = read(root, "docs/compass.md");
  const body = text.slice(text.indexOf(MAP_START) + MAP_START.length, text.indexOf(MAP_END));
  assert.ok(body.trim().length > 0, "the map block is filled again");
});

test("a no-op run never creates docs/compass.md", async (t) => {
  const root = await indexedProject(t);
  rmSync(mapPath(root));
  await buildIndex(root);
  assert.equal(has(root, "docs/compass.md"), false);
});
