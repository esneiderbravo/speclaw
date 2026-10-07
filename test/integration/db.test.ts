import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
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

/** Rewind a freshly created index to the schema-10 shape (no `edges.is_member`). */
function seedSchema10(root: string, cacheRows: number): void {
  openDb(root).close();
  const raw = new DatabaseSync(indexPath(root));
  const cols = (raw.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  if (cols.includes("is_member")) raw.exec("ALTER TABLE edges DROP COLUMN is_member");
  if (cols.includes("spec")) raw.exec("ALTER TABLE edges DROP COLUMN spec");
  raw.prepare("UPDATE meta SET value = '10' WHERE key = 'schema_version'").run();
  raw.prepare("DELETE FROM meta WHERE key = 'needs_reindex'").run();
  const ins = raw.prepare(
    "INSERT INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at) VALUES (?, 'm', 1, ?, 0, 0)",
  );
  for (let i = 0; i < cacheRows; i++) ins.run(`h${i}`, new Uint8Array([i]));
  raw.close();
}

// Covers: req~schema-edge-membership~1
test("schema 10 migrates past 11 and forces a reindex keeping embeddings", (t) => {
  const root = tmpRepo(t);
  seedSchema10(root, 12);

  const db = openDb(root);
  const cols = (db.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  const meta = new Map(
    (db.prepare("SELECT key, value FROM meta").all() as Array<{ key: string; value: string }>).map(
      (r) => [r.key, r.value],
    ),
  );
  const cache = db.prepare("SELECT COUNT(*) AS n FROM embedding_cache").get() as { n: number };
  db.close();

  assert.ok(cols.includes("is_member"));
  assert.ok(cols.includes("spec"));
  assert.equal(meta.get("schema_version"), SCHEMA_VERSION);
  assert.equal(meta.get("needs_reindex"), "1");
  assert.match(meta.get("reindex_reason") ?? "", /schema 11/);
  assert.equal(cache.n, 12);
});

// Covers: req~schema-edge-membership~1
test("a schema-11 index without edges.spec gains it in place keeping embeddings", (t) => {
  const root = tmpRepo(t);
  seedSchema10(root, 5);
  const raw = new DatabaseSync(indexPath(root));
  raw.exec("ALTER TABLE edges ADD COLUMN is_member INTEGER NOT NULL DEFAULT 0");
  raw.prepare("UPDATE meta SET value = '11' WHERE key = 'schema_version'").run();
  raw.close();

  const db = openDb(root);
  const cols = (db.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  const marker = db.prepare("SELECT value FROM meta WHERE key = 'needs_reindex'").get() as
    { value: string } | undefined;
  const cache = db.prepare("SELECT COUNT(*) AS n FROM embedding_cache").get() as { n: number };
  db.close();
  assert.ok(cols.includes("spec"));
  assert.equal(marker?.value, "1", "edges are re-extracted to fill spec");
  assert.equal(cache.n, 5, "not wiped");
});

// Covers: req~schema-edge-membership~1
test("a failed 10 to 11 migration rolls back and keeps schema 10", (t) => {
  const root = tmpRepo(t);
  seedSchema10(root, 0);
  // Abort the transaction at its last step (the version stamp), after the ALTER.
  const raw = new DatabaseSync(indexPath(root));
  raw.exec(`CREATE TRIGGER fail_stamp BEFORE UPDATE ON meta
    WHEN new.key = 'schema_version' AND new.value = '11'
    BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
  raw.close();

  assert.throws(() => openDb(root), /10→11/);

  const check = new DatabaseSync(indexPath(root));
  const ver = check.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  const cols = (check.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  const marker = check.prepare("SELECT value FROM meta WHERE key = 'needs_reindex'").get();
  check.close();
  assert.equal(ver.value, "10");
  assert.ok(!cols.includes("is_member"));
  assert.equal(marker, undefined);
});

// Covers: req~schema-edge-membership~1
test("reindex after migration recomputes no unchanged embedding", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", "export function alpha(): number { return 1; }\n");
  write(
    root,
    "src/b.ts",
    'import { alpha } from "./a.js";\nexport function beta(): number { return alpha(); }\n',
  );
  write(root, "test/b.test.ts", 'import { beta } from "../src/b.js";\nbeta();\n');
  const first = await buildIndex(root);
  assert.ok(first.computed > 0);

  // Rewind the built index to schema 10, keeping its embedding cache.
  const raw = new DatabaseSync(indexPath(root));
  raw.exec("ALTER TABLE edges DROP COLUMN is_member");
  raw.exec("ALTER TABLE edges DROP COLUMN spec");
  raw.prepare("UPDATE meta SET value = '10' WHERE key = 'schema_version'").run();
  raw.prepare("DELETE FROM meta WHERE key = 'needs_reindex'").run();
  raw.close();

  const second = await buildIndex(root);
  assert.equal(second.files, 3, "every file is re-extracted");
  assert.equal(second.unchanged, 0);
  assert.equal(second.computed, 0, "unchanged symbols reuse their cached vectors");
  assert.equal(second.fromCache, first.computed);
  const db = openDb(root);
  const marker = db.prepare("SELECT value FROM meta WHERE key = 'needs_reindex'").get();
  db.close();
  assert.equal(marker, undefined, "the needs-reindex marker is cleared");
});

// Covers: req~schema-edge-membership~1
test("schema 9 migrates through 10 and 11 to 12 via openDb keeping embeddings", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", "export function alpha(): number { return 1; }\n");
  await buildIndex(root);

  // Rewind to the schema-9 shape: no node_text/FTS/pagerank, no edges.is_member.
  const raw = new DatabaseSync(indexPath(root));
  raw.exec(`
    DROP TRIGGER IF EXISTS node_text_ai;
    DROP TRIGGER IF EXISTS node_text_ad;
    DROP TRIGGER IF EXISTS node_text_au;
    DROP TABLE IF EXISTS nodes_fts;
    DROP TABLE IF EXISTS node_text;
    DROP TABLE IF EXISTS pagerank;
    ALTER TABLE edges DROP COLUMN is_member;
    ALTER TABLE edges DROP COLUMN spec;
  `);
  raw.prepare("UPDATE meta SET value = '9' WHERE key = 'schema_version'").run();
  raw.prepare("DELETE FROM meta WHERE key = 'needs_reindex'").run();
  const cached = (raw.prepare("SELECT COUNT(*) AS n FROM embedding_cache").get() as { n: number })
    .n;
  raw.close();
  assert.ok(cached > 0);

  const db = openDb(root);
  const cols = (db.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  const ver = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  const marker = db.prepare("SELECT value FROM meta WHERE key = 'needs_reindex'").get() as {
    value: string;
  };
  const after = (db.prepare("SELECT COUNT(*) AS n FROM embedding_cache").get() as { n: number }).n;
  const nodeText = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'node_text'").get();
  db.close();

  assert.equal(ver.value, SCHEMA_VERSION);
  assert.ok(cols.includes("is_member"), "edges.is_member exists after the chain");
  assert.ok(cols.includes("spec"), "edges.spec exists after the chain");
  assert.ok(nodeText, "the 9→10 step ran");
  assert.equal(marker.value, "1");
  assert.equal(after, cached, "embedding cache rows are kept");
});

/** Rewind a freshly created index to a schema-11 stamp (with `edges.spec`). */
function seedSchema11(root: string, cacheRows: number): void {
  openDb(root).close();
  const raw = new DatabaseSync(indexPath(root));
  raw.prepare("UPDATE meta SET value = '11' WHERE key = 'schema_version'").run();
  raw.prepare("DELETE FROM meta WHERE key IN ('needs_reindex', 'reindex_reason')").run();
  const ins = raw.prepare(
    "INSERT INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at) VALUES (?, 'm', 1, ?, 0, 0)",
  );
  for (let i = 0; i < cacheRows; i++) ins.run(`k${i}`, new Uint8Array([i]));
  raw.close();
}

function metaOf(db: DatabaseSync): Map<string, string> {
  return new Map(
    (db.prepare("SELECT key, value FROM meta").all() as Array<{ key: string; value: string }>).map(
      (r) => [r.key, r.value],
    ),
  );
}

// Covers: req~schema-ref-edges~1
test("schema 11 migrates to 12 and keeps embeddings", (t) => {
  const root = tmpRepo(t);
  seedSchema11(root, 10);
  const db = openDb(root);
  const meta = metaOf(db);
  const cache = db.prepare("SELECT COUNT(*) AS n FROM embedding_cache").get() as { n: number };
  db.close();
  assert.equal(meta.get("schema_version"), "12");
  assert.equal(meta.get("needs_reindex"), "1");
  assert.match(meta.get("reindex_reason") ?? "", /schema 12/);
  assert.equal(cache.n, 10);
});

// Covers: req~schema-ref-edges~1
test("failed 11 to 12 migration rolls back", (t) => {
  const root = tmpRepo(t);
  seedSchema11(root, 0);
  const raw = new DatabaseSync(indexPath(root));
  raw.exec(`CREATE TRIGGER fail_stamp_12 BEFORE UPDATE ON meta
    WHEN new.key = 'schema_version' AND new.value = '12'
    BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
  raw.close();

  assert.throws(() => openDb(root), /11→12/);

  const check = new DatabaseSync(indexPath(root));
  const meta = metaOf(check);
  check.close();
  assert.equal(meta.get("schema_version"), "11");
  assert.equal(meta.has("needs_reindex"), false);
});

// Covers: req~schema-edge-membership~1, req~schema-ref-edges~1
test("schema 10 migrates through 11 to 12 keeping embeddings", (t) => {
  const root = tmpRepo(t);
  seedSchema10(root, 7);
  const db = openDb(root);
  const meta = metaOf(db);
  const cache = db.prepare("SELECT COUNT(*) AS n FROM embedding_cache").get() as { n: number };
  db.close();
  assert.equal(meta.get("schema_version"), "12");
  assert.equal(meta.get("needs_reindex"), "1");
  assert.match(meta.get("reindex_reason") ?? "", /schema 12/);
  assert.equal(cache.n, 7);
});

// Covers: req~schema-ref-edges~1
test("reindex after the 12 migration adds ref edges without re-embedding", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/types.ts", "export interface Props {\n  id: string;\n}\n");
  write(
    root,
    "src/view.ts",
    'import type { Props } from "./types.js";\nexport function render(p: Props): string {\n  return p.id;\n}\n',
  );
  const first = await buildIndex(root);
  assert.ok(first.computed > 0);

  // Rewind the built index to schema 11: no ref edges, no reindex marker.
  const raw = new DatabaseSync(indexPath(root));
  raw.exec("DELETE FROM edges WHERE kind = 'ref'");
  raw.prepare("UPDATE meta SET value = '11' WHERE key = 'schema_version'").run();
  raw.prepare("DELETE FROM meta WHERE key IN ('needs_reindex', 'reindex_reason')").run();
  raw.close();

  const second = await buildIndex(root);
  assert.equal(second.files, 2, "every file is re-extracted");
  assert.equal(second.unchanged, 0);
  assert.equal(second.computed, 0, "embeddings computed: 0");
  const db = openDb(root);
  const refs = db.prepare("SELECT COUNT(*) AS n FROM edges WHERE kind = 'ref'").get() as {
    n: number;
  };
  const ver = metaOf(db).get("schema_version");
  db.close();
  assert.equal(ver, "12");
  assert.ok(refs.n >= 1, "ref edges exist after the reindex");
});
