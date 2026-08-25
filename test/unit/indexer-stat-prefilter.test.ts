import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { openDb } from "../../src/modules/compass/db.js";

test("matching mtime+size skips reading bytes", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): number { return 1; }\n`);
  await buildIndex(root);

  const file = path.join(root, "src", "a.ts");
  const db0 = openDb(root);
  const prior = db0
    .prepare("SELECT hash, mtime_ms, size FROM files WHERE path = ?")
    .get("src/a.ts") as { hash: string; mtime_ms: number; size: number };
  db0.close();
  assert.ok(prior.mtime_ms != null);

  // Same length, different body — would change content hash if read.
  fs.writeFileSync(file, `export function a(): number { return 9; }\n`);
  const sec = prior.mtime_ms / 1000;
  fs.utimesSync(file, sec, sec);

  const stats = await buildIndex(root);
  assert.ok(stats.skippedByStat >= 1, `skippedByStat=${stats.skippedByStat}`);
  assert.equal(stats.computed, 0);

  const db = openDb(root);
  const row = db.prepare("SELECT hash FROM files WHERE path = ?").get("src/a.ts") as {
    hash: string;
  };
  assert.equal(row.hash, prior.hash, "stale content must not have been re-hashed");
  db.close();
});

test("force bypasses the stat prefilter and re-hashes", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): number { return 1; }\n`);
  await buildIndex(root);

  const file = path.join(root, "src", "a.ts");
  const db0 = openDb(root);
  const prior = db0.prepare("SELECT hash, mtime_ms FROM files WHERE path = ?").get("src/a.ts") as {
    hash: string;
    mtime_ms: number;
  };
  db0.close();

  fs.writeFileSync(file, `export function a(): number { return 9; }\n`);
  const sec = prior.mtime_ms / 1000;
  fs.utimesSync(file, sec, sec);

  const stats = await buildIndex(root, { force: true });
  assert.equal(stats.skippedByStat, 0);

  const db = openDb(root);
  const row = db.prepare("SELECT hash FROM files WHERE path = ?").get("src/a.ts") as {
    hash: string;
  };
  assert.notEqual(row.hash, prior.hash);
  db.close();
});
