import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/** A row of the `files` table: one indexed source file. */
export interface FileRow {
  id: number;
  path: string;
  hash: string;
  lang: string;
}

/** A row of the `nodes` table: one definition (function, class, method, type). */
export interface NodeRow {
  id: number;
  file_id: number;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  start_byte: number;
  end_byte: number;
  parent_id: number | null;
  signature: string | null;
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
  lang TEXT NOT NULL
);
-- nodes: the definitions in the codebase (functions, classes, methods, types).
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
  signature TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_id);
-- edges: a reference from one node to a named target, resolved lazily.
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY,
  src_node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
  src_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  dst_name TEXT NOT NULL,
  dst_node_id INTEGER,
  kind TEXT NOT NULL,
  line INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst_name);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_dstid ON edges(dst_node_id);
-- node_embeddings: the local vector store (one embedding per node).
CREATE TABLE IF NOT EXISTS node_embeddings (
  node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  dim INTEGER NOT NULL,
  model TEXT NOT NULL,
  vec BLOB NOT NULL
);
`;

/** Schema version stamped into the `meta` table on first creation. */
export const SCHEMA_VERSION = "2";

/**
 * Open (creating if needed) the index database at `<projectPath>/.speclaw/index.db`.
 *
 * Ensures the `.speclaw` directory exists, applies the schema (idempotently),
 * enables WAL journaling and foreign keys, and stamps the schema version on a
 * fresh database.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns An open connection to the index database.
 */
export function openDb(projectPath: string): DatabaseSync {
  const dir = path.join(projectPath, ".speclaw");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "index.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?)").run(
      SCHEMA_VERSION
    );
  }
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
