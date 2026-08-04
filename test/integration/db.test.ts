import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { openDb, indexExists, indexPath, SCHEMA_VERSION } from "../../src/modules/compass/db.js";

test("openDb creates the index, applies the schema, and stamps the version", (t) => {
  const root = tmpRepo(t);
  assert.equal(indexExists(root), false);
  const db = openDb(root);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(row.value, SCHEMA_VERSION);
  db.close();
  assert.equal(indexExists(root), true);
  assert.equal(indexPath(root), path.join(root, ".speclaw", "index.db"));
});

test("openDb reopens an up-to-date database without dropping data", (t) => {
  const root = tmpRepo(t);
  let db = openDb(root);
  db.prepare("INSERT INTO files(path, hash, lang) VALUES ('a.ts','h','typescript')").run();
  db.close();

  db = openDb(root);
  const count = db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number };
  assert.equal(count.n, 1, "data survives a reopen when the schema version matches");
  db.close();
});

test("openDb rebuilds a database stamped with an incompatible schema version", (t) => {
  const root = tmpRepo(t);
  let db = openDb(root);
  db.prepare("INSERT INTO files(path, hash, lang) VALUES ('a.ts','h','typescript')").run();
  db.close();

  // Simulate an older speclaw: bump the stamped version to something stale.
  const raw = new DatabaseSync(indexPath(root));
  raw.prepare("UPDATE meta SET value = '0' WHERE key = 'schema_version'").run();
  raw.close();

  db = openDb(root); // should detect staleness and reset
  const count = db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number };
  assert.equal(count.n, 0, "stale schema is dropped and rebuilt empty");
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(row.value, SCHEMA_VERSION);
  db.close();
});
