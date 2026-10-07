import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { contentHashFor, defaultEmbedText } from "./embed-input.js";

/** A row of the `files` table: one indexed source file. */
export interface FileRow {
  id: number;
  path: string;
  hash: string;
  lang: string;
  is_test: number;
  module: string;
  mtime_ms: number | null;
  size: number | null;
}

/** A row of the `nodes` table: one definition (function, class, method, type). */
export interface NodeRow {
  id: number;
  file_id: number;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  /** Inclusive start offset — a UTF-16 code-unit index into the decoded source, despite the name. */
  start_byte: number;
  /** Exclusive end offset — a UTF-16 code-unit index into the decoded source, despite the name. */
  end_byte: number;
  parent_id: number | null;
  signature: string | null;
  body_hash: string | null;
  norm_hash: string | null;
  content_hash: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  hash TEXT NOT NULL,
  lang TEXT NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0,
  module TEXT NOT NULL DEFAULT '',
  mtime_ms INTEGER,
  size INTEGER
);
CREATE INDEX IF NOT EXISTS idx_files_is_test ON files(is_test);
-- nodes: the definitions in the codebase (functions, classes, methods, types).
-- start_byte/end_byte are UTF-16 code-unit offsets into the decoded source
-- (tree-sitter's startIndex/endIndex), not UTF-8 byte offsets, despite the names.
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL,
  parent_id INTEGER,
  signature TEXT,
  body_hash TEXT,
  norm_hash TEXT,
  content_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_id);
CREATE INDEX IF NOT EXISTS idx_nodes_norm_hash ON nodes(norm_hash);
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
-- node_metrics: AST health frames (LOC / nesting / branches) per definition.
CREATE TABLE IF NOT EXISTS node_metrics (
  node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  loc INTEGER NOT NULL,
  max_nesting INTEGER NOT NULL,
  branches INTEGER NOT NULL
);
-- edges: a reference from one node to a named target, resolved lazily.
-- src_node_id is never NULL for an edge indexed under schema 11: a reference
-- outside any definition is owned by its file's file-owner node (kind 'file').
-- is_member = 1 marks a member call on a foreign receiver (never bound by name);
-- 2 a member call on an import binding, bound only once the import with the
-- same spec in the same file resolves to a project file (a package otherwise).
-- spec: JS/TS module specifier of an import edge, or of the import binding a
-- call's receiver/callee comes from.
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY,
  src_node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
  src_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  dst_name TEXT NOT NULL,
  dst_node_id INTEGER,
  kind TEXT NOT NULL,
  line INTEGER NOT NULL,
  is_member INTEGER NOT NULL DEFAULT 0,
  spec TEXT
);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst_name);
CREATE INDEX IF NOT EXISTS idx_edges_srcfile ON edges(src_file_id, kind);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_dstid ON edges(dst_node_id);
-- embedding_cache: vectors keyed by embedder-input content hash (survives reindex).
CREATE TABLE IF NOT EXISTS embedding_cache (
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (content_hash, model)
);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_seen ON embedding_cache(last_seen_at);
-- dir_hashes: Merkle tree of indexed directories ("" = project root).
CREATE TABLE IF NOT EXISTS dir_hashes (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  n_files INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- git_history_cache: memoized results of the expensive git-history scans
-- (churn, co-change), keyed by query and invalidated when HEAD moves.
CREATE TABLE IF NOT EXISTS git_history_cache (
  query_key TEXT PRIMARY KEY,
  head_sha TEXT NOT NULL,
  payload TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);
-- coverage_links: derived requirement-coverage directives from comment nodes.
-- Spec items themselves are NOT persisted — always reparsed from disk.
CREATE TABLE IF NOT EXISTS coverage_links (
  id INTEGER PRIMARY KEY,
  artifact_type TEXT NOT NULL,
  name TEXT NOT NULL,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  origin TEXT NOT NULL,
  UNIQUE (artifact_type, name, revision, kind, file_path, line)
);
CREATE INDEX IF NOT EXISTS idx_cov_target ON coverage_links(artifact_type, name, revision);
CREATE INDEX IF NOT EXISTS idx_cov_file ON coverage_links(file_path);
CREATE INDEX IF NOT EXISTS idx_cov_node ON coverage_links(node_id);
-- spec_anchors: projection of committed lawbook/anchors/*.json (source of truth on disk).
CREATE TABLE IF NOT EXISTS spec_anchors (
  id INTEGER PRIMARY KEY,
  spec_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL DEFAULT '',
  anchor_kind TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  file_path TEXT,
  node_id INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
  resolution TEXT NOT NULL,
  content_hash TEXT,
  raw_hash TEXT,
  archived_at TEXT NOT NULL,
  commit_sha TEXT,
  source TEXT NOT NULL,
  normalizer_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (spec_id, requirement_id, scenario_id, anchor_kind, symbol_name)
);
CREATE INDEX IF NOT EXISTS idx_anchors_capability ON spec_anchors(capability);
CREATE INDEX IF NOT EXISTS idx_anchors_symbol ON spec_anchors(symbol_name);
CREATE INDEX IF NOT EXISTS idx_anchors_node ON spec_anchors(node_id);
-- node_text: searchable name/subtokens/signature/doc (FTS content source).
CREATE TABLE IF NOT EXISTS node_text (
  node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subtokens TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL DEFAULT '',
  doc TEXT NOT NULL DEFAULT ''
);
-- pagerank: global (non-personalized) scores recomputed at index time.
CREATE TABLE IF NOT EXISTS pagerank (
  node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  score REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pagerank_score ON pagerank(score DESC);
`;

const FTS_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  name, subtokens, signature, doc,
  content='node_text', content_rowid='node_id',
  tokenize="unicode61 remove_diacritics 0 tokenchars '_$'",
  prefix='2 3'
);
CREATE TRIGGER IF NOT EXISTS node_text_ai AFTER INSERT ON node_text BEGIN
  INSERT INTO nodes_fts(rowid, name, subtokens, signature, doc)
  VALUES (new.node_id, new.name, new.subtokens, new.signature, new.doc);
END;
CREATE TRIGGER IF NOT EXISTS node_text_ad AFTER DELETE ON node_text BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, subtokens, signature, doc)
  VALUES ('delete', old.node_id, old.name, old.subtokens, old.signature, old.doc);
END;
CREATE TRIGGER IF NOT EXISTS node_text_au AFTER UPDATE ON node_text BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name, subtokens, signature, doc)
  VALUES ('delete', old.node_id, old.name, old.subtokens, old.signature, old.doc);
  INSERT INTO nodes_fts(rowid, name, subtokens, signature, doc)
  VALUES (new.node_id, new.name, new.subtokens, new.signature, new.doc);
END;
`;

/** Ensure node_embeddings is a VIEW over embedding_cache (idempotent). */
function ensureEmbeddingsView(db: DatabaseSync): void {
  const row = db
    .prepare("SELECT type FROM sqlite_master WHERE name = 'node_embeddings' LIMIT 1")
    .get() as { type: string } | undefined;
  if (row?.type === "view") return;
  if (row?.type === "table") {
    db.exec("DROP TABLE node_embeddings");
  }
  db.exec(`
    CREATE VIEW node_embeddings AS
      SELECT n.id AS node_id, ec.dim AS dim, ec.model AS model, ec.vec AS vec
      FROM nodes n
      JOIN embedding_cache ec ON ec.content_hash = n.content_hash
  `);
}

/**
 * Try to create the FTS5 virtual table + sync triggers. Soft-degrades when the
 * Node SQLite build lacks FTS5 (pre-22.16).
 *
 * @returns Whether FTS5 is usable after this call.
 */
export function ensureFts(db: DatabaseSync): boolean {
  const existing = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'nodes_fts' LIMIT 1").get();
  if (existing) {
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('fts5', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
    return true;
  }
  try {
    db.exec(FTS_DDL);
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('fts5', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
    return true;
  } catch {
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('fts5', '0') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
    return false;
  }
}

/** Whether the open database has a usable FTS5 index. */
export function ftsAvailable(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'fts5'").get() as
    { value: string } | undefined;
  if (row?.value === "0") return false;
  const tbl = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'nodes_fts' LIMIT 1").get();
  return Boolean(tbl);
}

/** Probe whether this Node build can create an FTS5 virtual table. */
export function probeFts5Support(): boolean {
  try {
    const mem = new DatabaseSync(":memory:");
    mem.exec("CREATE VIRTUAL TABLE t USING fts5(x)");
    mem.close();
    return true;
  } catch {
    return false;
  }
}

/** Schema version stamped into the `meta` table on first creation. */
export const SCHEMA_VERSION = "12";

/**
 * `nodes.kind` of the synthetic per-file owner node. It owns the references that
 * sit outside any definition (top-level imports, calls in callbacks) and is
 * hidden from find, name lookup, PageRank, FTS, embeddings, and metrics.
 */
export const FILE_NODE_KIND = "file";

/** The stamped schema version, or null if the db predates versioning / has no meta table. */
function readSchemaVersion(db: DatabaseSync): string | null {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      { value: string } | undefined;
    return row ? String(row.value) : null;
  } catch {
    return null; // meta table doesn't exist yet
  }
}

/**
 * Decide whether an existing database is from an incompatible schema and must be
 * rebuilt. Schema 8→9, 9→10, 10→11, and 11→12 are handled by migrators instead of a wipe.
 */
function isStale(db: DatabaseSync): boolean {
  const hasEdges = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'edges'")
    .get();
  if (!hasEdges) return false;
  const ver = readSchemaVersion(db);
  if (ver === "8" || ver === "9" || ver === "10" || ver === "11") return false; // migrate in openDb
  if (ver !== SCHEMA_VERSION) return true;
  const edgeCols = (db.prepare("PRAGMA table_info(edges)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  if (
    !edgeCols.includes("src_node_id") ||
    !edgeCols.includes("dst_node_id") ||
    !edgeCols.includes("is_member") ||
    !edgeCols.includes("spec")
  ) {
    return true;
  }
  const fileCols = (db.prepare("PRAGMA table_info(files)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  if (!fileCols.includes("is_test") || !fileCols.includes("module")) return true;
  const hasMetrics = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'node_metrics'")
    .get();
  return !hasMetrics;
}

/** Drop every table (children first) so the current schema can be recreated cleanly. */
function resetSchema(db: DatabaseSync): void {
  db.exec(`
    DROP VIEW IF EXISTS node_embeddings;
    DROP TRIGGER IF EXISTS node_text_ai;
    DROP TRIGGER IF EXISTS node_text_ad;
    DROP TRIGGER IF EXISTS node_text_au;
    DROP TABLE IF EXISTS nodes_fts;
    DROP TABLE IF EXISTS pagerank;
    DROP TABLE IF EXISTS node_text;
    DROP TABLE IF EXISTS spec_anchors;
    DROP TABLE IF EXISTS coverage_links;
    DROP TABLE IF EXISTS git_history_cache;
    DROP TABLE IF EXISTS embedding_cache;
    DROP TABLE IF EXISTS dir_hashes;
    DROP TABLE IF EXISTS edges;
    DROP TABLE IF EXISTS node_metrics;
    DROP TABLE IF EXISTS nodes;
    DROP TABLE IF EXISTS files;
    DROP TABLE IF EXISTS meta;
  `);
}

/**
 * Migrate schema 8 → 9: embedding_cache, dir_hashes, mtime/size, content_hash,
 * preserve vectors into the cache, replace node_embeddings table with a view.
 *
 * @param db - Open connection already at schema 8.
 * @param projectPath - Project root for backfilling content hashes from disk.
 */
export function migrate8to9(db: DatabaseSync, projectPath: string): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        content_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        dim INTEGER NOT NULL,
        vec BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        PRIMARY KEY (content_hash, model)
      );
      CREATE INDEX IF NOT EXISTS idx_embedding_cache_seen ON embedding_cache(last_seen_at);
      CREATE TABLE IF NOT EXISTS dir_hashes (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        n_files INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const fileCols = (db.prepare("PRAGMA table_info(files)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    if (!fileCols.includes("mtime_ms")) db.exec("ALTER TABLE files ADD COLUMN mtime_ms INTEGER");
    if (!fileCols.includes("size")) db.exec("ALTER TABLE files ADD COLUMN size INTEGER");

    const nodeCols = (db.prepare("PRAGMA table_info(nodes)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    if (!nodeCols.includes("content_hash")) {
      db.exec("ALTER TABLE nodes ADD COLUMN content_hash TEXT");
      db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash)");
    }

    const upd = db.prepare("UPDATE nodes SET content_hash = ? WHERE id = ?");
    const rows = db
      .prepare(
        `SELECT n.id, n.kind, n.name, n.signature, f.lang
         FROM nodes n JOIN files f ON f.id = n.file_id`,
      )
      .all() as Array<{
      id: number;
      kind: string;
      name: string;
      signature: string | null;
      lang: string;
    }>;
    for (const r of rows) {
      const embedText = defaultEmbedText(r.kind, r.name, r.signature);
      upd.run(
        contentHashFor({
          lang: r.lang,
          kind: r.kind,
          name: r.name,
          signature: r.signature,
          embedText,
        }),
        r.id,
      );
    }
    void projectPath;

    const now = Date.now();
    const embType = db
      .prepare("SELECT type FROM sqlite_master WHERE name = 'node_embeddings' LIMIT 1")
      .get() as { type: string } | undefined;
    if (embType?.type === "table") {
      db.prepare(
        `INSERT OR IGNORE INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at)
         SELECT n.content_hash, ne.model, ne.dim, ne.vec, ?, ?
         FROM node_embeddings ne
         JOIN nodes n ON n.id = ne.node_id
         WHERE n.content_hash IS NOT NULL`,
      ).run(now, now);
      db.exec("DROP TABLE node_embeddings");
    }

    ensureEmbeddingsView(db);

    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run("9");
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw new Error(
      `schema 8→9 migration failed — delete .speclaw/index.db to rebuild: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/**
 * Migrate schema 9 → 10: `node_text`, optional FTS5, `pagerank`. Embedding cache
 * is left intact; a reindex is required to populate text rows.
 *
 * @param db - Open connection already at schema 9.
 */
export function migrate9to10(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS node_text (
        node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        subtokens TEXT NOT NULL DEFAULT '',
        signature TEXT NOT NULL DEFAULT '',
        doc TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS pagerank (
        node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
        score REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pagerank_score ON pagerank(score DESC);
    `);
    ensureFts(db);
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run("10");
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('needs_reindex', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('reindex_reason', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run("schema 10 adds full-text index (names, subtokens, signatures, docs); reindex required");
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw new Error(
      `schema 9→10 migration failed — delete .speclaw/index.db to rebuild: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/** Whether `edges` already has the schema-11 `spec` column (or does not exist yet). */
function hasEdgeSpec(db: DatabaseSync): boolean {
  const cols = (db.prepare("PRAGMA table_info(edges)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  return cols.length === 0 || cols.includes("spec");
}

/** Reason recorded with the needs-reindex marker by the 10→11 migration. */
export const SCHEMA_11_REINDEX_REASON =
  "schema 11 adds file-owner nodes, member-call flags and full import text; reindex required";

/**
 * Migrate schema 10 → 11: add `edges.is_member` and `edges.spec` (each only
 * when missing, so a pre-release schema-11 index lacking `spec` takes the same
 * path), set the needs-reindex marker, and stamp `"11"`, all in one
 * `BEGIN IMMEDIATE` transaction. The next index
 * run re-extracts every file (edge ownership and import text change), while
 * `embedding_cache` is untouched so unchanged symbols reuse their vectors.
 *
 * @param db - Open connection already at schema 10.
 * @throws If any step fails; the transaction is rolled back and the stamp stays `"10"`.
 */
export function migrate10to11(db: DatabaseSync): void {
  // Covers: req~schema-edge-membership~1
  db.exec("BEGIN IMMEDIATE");
  try {
    const cols = (db.prepare("PRAGMA table_info(edges)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    // No edges table yet (a partial older index): the schema DDL creates it with the column.
    if (cols.length > 0 && !cols.includes("is_member")) {
      db.exec("ALTER TABLE edges ADD COLUMN is_member INTEGER NOT NULL DEFAULT 0");
    }
    if (cols.length > 0 && !cols.includes("spec")) {
      db.exec("ALTER TABLE edges ADD COLUMN spec TEXT");
    }
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('needs_reindex', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('reindex_reason', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(SCHEMA_11_REINDEX_REASON);
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run("11");
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw new Error(
      `schema 10→11 migration failed — delete .speclaw/index.db to rebuild: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/** Reason recorded with the needs-reindex marker by the 11→12 migration. */
export const SCHEMA_12_REINDEX_REASON =
  "schema 12 adds type-reference (ref) edges for explore callers; reindex required";

/**
 * Migrate schema 11 → 12: set the needs-reindex marker (its reason names
 * schema 12, after any reason an earlier step of the same chain recorded) and
 * stamp `"12"`, in one `BEGIN IMMEDIATE` transaction. No column changes
 * (`edges.kind` is text); the next index run re-extracts every file so `ref`
 * edges exist, while `embedding_cache` is untouched so unchanged symbols reuse
 * their vectors.
 *
 * @param db - Open connection already at schema 11 (with `edges.spec`).
 * @throws If any step fails; the transaction is rolled back and the stamp stays `"11"`.
 */
export function migrate11to12(db: DatabaseSync): void {
  // Covers: req~schema-ref-edges~1
  db.exec("BEGIN IMMEDIATE");
  try {
    const pending = db.prepare("SELECT value FROM meta WHERE key = 'needs_reindex'").get() as
      { value: string } | undefined;
    const prior = db.prepare("SELECT value FROM meta WHERE key = 'reindex_reason'").get() as
      { value: string } | undefined;
    const reason =
      pending?.value === "1" && prior?.value && prior.value !== SCHEMA_12_REINDEX_REASON
        ? `${prior.value}; ${SCHEMA_12_REINDEX_REASON}`
        : SCHEMA_12_REINDEX_REASON;
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('needs_reindex', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('reindex_reason', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(reason);
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run("12");
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw new Error(
      `schema 11→12 migration failed — delete .speclaw/index.db to rebuild: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/**
 * Open (creating if needed) the index database at `<projectPath>/.speclaw/index.db`.
 *
 * Ensures the `.speclaw` directory exists, enables WAL journaling and foreign
 * keys, and applies the schema. Schema 8→9, 9→10, 10→11, and 11→12 migrate in
 * place and chain forward (embeddings preserved). Other incompatible schemas are wiped
 * and rebuilt.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns An open connection to the index database.
 * @throws If an in-place migration fails (the connection is closed first).
 */
export function openDb(projectPath: string): DatabaseSync {
  const dir = path.join(projectPath, ".speclaw");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "index.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  const ver = (() => {
    try {
      return readSchemaVersion(db);
    } catch {
      return null;
    }
  })();

  if (ver === "8" || ver === "9" || ver === "10" || ver === "11") {
    try {
      if (ver === "8") migrate8to9(db, projectPath);
      if (ver === "8" || ver === "9") migrate9to10(db);
      // A pre-release schema-11 index (no `edges.spec`) takes the 10→11 step too.
      if (ver !== "11" || !hasEdgeSpec(db)) migrate10to11(db);
      migrate11to12(db);
    } catch (err) {
      db.close();
      throw err;
    }
    db.exec(SCHEMA);
    ensureEmbeddingsView(db);
    ensureFts(db);
  } else {
    const wiped = isStale(db);
    if (wiped) resetSchema(db);
    db.exec(SCHEMA);
    ensureEmbeddingsView(db);
    ensureFts(db);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      { value: string } | undefined;
    if (!row) {
      db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
    }
    if (wiped) {
      db.prepare(
        "INSERT INTO meta(key, value) VALUES ('needs_reindex', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run();
    }
  }

  rehydrateAnchors(db, projectPath);
  return db;
}

/**
 * Rebuild `spec_anchors` from `lawbook/anchors/*.json`. Idempotent; called on
 * every open so a wiped `.speclaw/` still sees committed seals.
 */
export function rehydrateAnchors(db: DatabaseSync, projectPath: string): void {
  const dir = path.join(projectPath, "lawbook", "anchors");
  db.exec("DELETE FROM spec_anchors");
  if (!fs.existsSync(dir)) return;
  const ins = db.prepare(
    `INSERT OR REPLACE INTO spec_anchors(
       spec_id, capability, requirement_id, scenario_id, anchor_kind, symbol_name,
       file_path, node_id, resolution, content_hash, raw_hash, archived_at, commit_sha,
       source, normalizer_version
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    let parsed: {
      capability?: string;
      normalizerVersion?: number;
      anchors?: Array<Record<string, unknown>>;
    };
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as typeof parsed;
    } catch {
      continue;
    }
    const capability = parsed.capability ?? name.replace(/\.json$/, "");
    const nv = Number(parsed.normalizerVersion ?? 1);
    for (const a of parsed.anchors ?? []) {
      ins.run(
        String(a.specId ?? capability),
        capability,
        String(a.requirementId ?? ""),
        String(a.scenarioId ?? ""),
        String(a.anchorKind ?? "symbol"),
        String(a.symbolName ?? ""),
        a.filePath == null ? null : String(a.filePath),
        String(a.resolution ?? "unresolved"),
        a.contentHash == null ? null : String(a.contentHash),
        a.rawHash == null ? null : String(a.rawHash),
        String(a.archivedAt ?? new Date().toISOString()),
        a.commitSha == null ? null : String(a.commitSha),
        String(a.source ?? "backtick"),
        Number(a.normalizerVersion ?? nv),
      );
    }
  }
}

/** Whether the index was wiped and must be rebuilt before hash comparisons. */
export function needsReindex(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'needs_reindex'").get() as
    { value: string } | undefined;
  return row?.value === "1";
}

/** Clear the needs-reindex marker after a successful index run. */
export function clearNeedsReindex(db: DatabaseSync): void {
  db.prepare("DELETE FROM meta WHERE key = 'needs_reindex'").run();
}

/** `meta` key set by a per-file reindex until the next full post-processing pass. */
const POST_PENDING_KEY = "post_pending";

/**
 * Whether a per-file reindex left global post-processing (PageRank, the compact
 * map, cache upkeep) for the next full run. While set, a full run may not take
 * its no-op fast path.
 */
export function postPending(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(POST_PENDING_KEY) as
    { value: string } | undefined;
  return row?.value === "1";
}

/** Record that a per-file reindex wrote rows and deferred the global pass. */
export function setPostPending(db: DatabaseSync): void {
  db.prepare(
    "INSERT INTO meta(key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(POST_PENDING_KEY);
}

/** Clear the per-file marker once a full run has done the global pass. */
export function clearPostPending(db: DatabaseSync): void {
  db.prepare("DELETE FROM meta WHERE key = ?").run(POST_PENDING_KEY);
}

/**
 * Whether an open index is current for a per-file write: this release's schema
 * version and edge shape, not stale, and no full reindex pending. Callers that
 * probe before taking the write lock re-check under it.
 */
export function isCurrentIndex(db: DatabaseSync): boolean {
  return (
    readSchemaVersion(db) === SCHEMA_VERSION && hasEdgeSpec(db) && !isStale(db) && !needsReindex(db)
  );
}

/**
 * Open an existing index for a per-file write only when it is current.
 *
 * Unlike {@link openDb}, this never creates the `.speclaw` directory or the
 * database, and never migrates, wipes, or re-stamps a schema: a missing index,
 * an old or stale schema, or a pending full reindex returns `null` after a
 * read-only probe, so the caller writes nothing and leaves the repair to the
 * next full run.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns A read-write connection (WAL, foreign keys, 5 s busy timeout), or `null`.
 */
export function openCurrentDb(projectPath: string): DatabaseSync | null {
  const file = indexPath(projectPath);
  if (!fs.existsSync(file)) return null;
  let current: boolean;
  const probe = new DatabaseSync(file, { readOnly: true });
  try {
    probe.exec("PRAGMA busy_timeout = 5000;");
    current = isCurrentIndex(probe);
  } catch {
    current = false;
  } finally {
    probe.close();
  }
  if (!current) return null;
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

/** Absolute path to the index database file for a project. */
export function indexPath(projectPath: string): string {
  return path.join(projectPath, ".speclaw", "index.db");
}

/** Whether an index database already exists for the project. */
export function indexExists(projectPath: string): boolean {
  return fs.existsSync(indexPath(projectPath));
}
