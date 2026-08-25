import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpRepo } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { SCHEMA_VERSION, openDb } from "../../src/modules/compass/db.js";

test("second index on unchanged tree recomputes zero embeddings", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  const first = await buildIndex(root);
  assert.ok(first.computed > 0);
  const second = await buildIndex(root);
  assert.equal(second.computed, 0);
  assert.ok(second.skippedByStat + second.unchanged > 0);
});

test("rename with identical content uses cache (computed 0)", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const from = path.join(root, "src", "util.ts");
  const to = path.join(root, "src", "helpers.ts");
  fs.renameSync(from, to);
  const stats = await buildIndex(root);
  assert.equal(stats.computed, 0, `expected 0 computed, got ${stats.computed}`);
  assert.ok(stats.fromCache >= 0);
});

test("migrate8to9 preserves embedding rows into cache", (t) => {
  const root = tmpRepo(t);
  const dir = path.join(root, ".speclaw");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "index.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta(key, value) VALUES ('schema_version', '8');
    CREATE TABLE files (
      id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, hash TEXT NOT NULL,
      lang TEXT NOT NULL, is_test INTEGER NOT NULL DEFAULT 0, module TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE nodes (
      id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      name TEXT NOT NULL, kind TEXT NOT NULL, start_line INTEGER, end_line INTEGER,
      start_byte INTEGER, end_byte INTEGER, parent_id INTEGER, signature TEXT,
      body_hash TEXT, norm_hash TEXT
    );
    CREATE TABLE node_embeddings (
      node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
      dim INTEGER NOT NULL, model TEXT NOT NULL, vec BLOB NOT NULL
    );
  `);
  const fileId = Number(
    db.prepare("INSERT INTO files(path, hash, lang) VALUES ('src/a.ts', 'h', 'typescript')").run()
      .lastInsertRowid,
  );
  const nodeId = Number(
    db
      .prepare(
        `INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte, signature)
         VALUES (?, 'alpha', 'function', 1, 2, 0, 10, '()')`,
      )
      .run(fileId).lastInsertRowid,
  );
  const vec = Buffer.alloc(8, 7);
  db.prepare("INSERT INTO node_embeddings(node_id, dim, model, vec) VALUES (?, 2, 'old', ?)").run(
    nodeId,
    vec,
  );
  db.close();

  const opened = openDb(root);
  const ver = opened.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(ver.value, SCHEMA_VERSION);
  const n = opened.prepare("SELECT COUNT(*) AS c FROM embedding_cache").get() as { c: number };
  assert.ok(n.c >= 1);
  const view = opened
    .prepare("SELECT type FROM sqlite_master WHERE name = 'node_embeddings'")
    .get() as { type: string };
  assert.equal(view.type, "view");
  opened.close();
});

test("failed migrate8to9 rolls back and leaves schema 8", (t) => {
  const root = tmpRepo(t);
  const dir = path.join(root, ".speclaw");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "index.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta(key, value) VALUES ('schema_version', '8');
    CREATE TABLE files (
      id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, hash TEXT NOT NULL
    );
    CREATE TABLE nodes (
      id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL,
      name TEXT NOT NULL, kind TEXT NOT NULL, start_line INTEGER, end_line INTEGER,
      start_byte INTEGER, end_byte INTEGER, parent_id INTEGER, signature TEXT,
      body_hash TEXT, norm_hash TEXT
    );
    CREATE TABLE node_embeddings (
      node_id INTEGER PRIMARY KEY,
      dim INTEGER NOT NULL, model TEXT NOT NULL, vec BLOB NOT NULL
    );
  `);
  db.close();

  assert.throws(() => openDb(root), /schema 8→9 migration failed|delete \.speclaw\/index\.db/);

  const check = new DatabaseSync(dbPath);
  const ver = check.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(ver.value, "8");
  check.close();
});
