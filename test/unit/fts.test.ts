import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import {
  openDb,
  SCHEMA_VERSION,
  ftsAvailable,
  migrate9to10,
} from "../../src/modules/compass/db.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { escapeFtsQuery } from "../../src/modules/compass/rank.js";
import { DatabaseSync } from "node:sqlite";

test("FTS bm25 orders ASC (more negative is better) and escape works", async (t) => {
  const root = tmpRepo(t);
  fs.writeFileSync(
    path.join(root, "a.ts"),
    `/** idempotent helper */\nexport function doThing() { return 1; }\n`,
  );
  fs.writeFileSync(path.join(root, "b.ts"), `export function idempotentRunner() { return 2; }\n`);
  await buildIndex(root);
  const db = openDb(root);
  t.after(() => db.close());
  assert.equal(
    (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string })
      .value,
    SCHEMA_VERSION,
  );
  assert.equal(ftsAvailable(db), true);
  const match = escapeFtsQuery("idempotent");
  const rows = db
    .prepare(
      `SELECT f.rowid AS id, bm25(nodes_fts, 10.0, 4.0, 2.0, 1.0) AS score
       FROM nodes_fts f WHERE nodes_fts MATCH ?
       ORDER BY score ASC LIMIT 5`,
    )
    .all(match) as Array<{ id: number; score: number }>;
  assert.ok(rows.length >= 1);
  assert.ok(rows[0]!.score <= (rows[1]?.score ?? rows[0]!.score));
});

test("migrate9to10 adds node_text and stamps 10", (t) => {
  const root = tmpRepo(t);
  fs.mkdirSync(path.join(root, ".speclaw"), { recursive: true });
  const dbPath = path.join(root, ".speclaw", "index.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta(key, value) VALUES ('schema_version', '9');
    CREATE TABLE files (id INTEGER PRIMARY KEY, path TEXT, hash TEXT, lang TEXT, is_test INT, module TEXT);
    CREATE TABLE nodes (
      id INTEGER PRIMARY KEY, file_id INT, name TEXT, kind TEXT,
      start_line INT, end_line INT, start_byte INT, end_byte INT
    );
    CREATE TABLE embedding_cache (
      content_hash TEXT, model TEXT, dim INT, vec BLOB, created_at INT, last_seen_at INT,
      PRIMARY KEY (content_hash, model)
    );
  `);
  migrate9to10(db);
  const ver = (
    db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }
  ).value;
  assert.equal(ver, "10");
  const nt = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'node_text'").get();
  assert.ok(nt);
  db.close();
});
