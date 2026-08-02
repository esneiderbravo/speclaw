import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { openDb } from "./db.js";
import { langForPath } from "./languages.js";
import { extract } from "./extract.js";
import { getEmbedder, toBlob } from "./embedder.js";

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", "out", "coverage",
  "__pycache__", ".venv", "venv", ".speclaw", ".mypy_cache", ".pytest_cache",
  "vendor", "target", ".turbo", ".cache",
]);

const MAX_FILE_BYTES = 1_500_000;

/** Summary counts returned after an indexing run. */
export interface IndexStats {
  files: number;
  nodes: number;
  edges: number;
  embeddings: number;
  unchanged: number;
  removed: number;
  embedder: string;
}

function hashOf(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function* walkFiles(root: string): Generator<string> {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        if (langForPath(full)) yield full;
      }
    }
  }
}

/** Progress notification emitted per file as an index run advances. */
export interface ProgressEvent {
  file: string;
  done: number;
  total: number;
}

/** Callback invoked with each {@link ProgressEvent} during indexing. */
export type ProgressFn = (e: ProgressEvent) => void;

/**
 * Build or incrementally refresh the index for a project.
 *
 * Walks the project's source files (skipping vendored/build directories and
 * oversized files), and for each file whose content hash changed, re-parses it,
 * replacing its nodes and edges and re-embedding each node. Files whose hash is
 * unchanged are skipped; files that disappeared are pruned. Finally resolves
 * call edges to their target node definitions by name. The whole run executes
 * in a single transaction, rolled back on any error.
 *
 * @param projectPath - Absolute path to the project root.
 * @param onProgress - Optional callback invoked once per scanned file.
 * @returns Counts of files, nodes, edges, embeddings, and pruned/unchanged files.
 * @throws Re-throws any error encountered mid-run after rolling back the transaction.
 */
export async function buildIndex(
  projectPath: string,
  onProgress?: ProgressFn
): Promise<IndexStats> {
  const db = openDb(projectPath);
  const embedder = getEmbedder();
  const stats: IndexStats = {
    files: 0, nodes: 0, edges: 0, embeddings: 0,
    unchanged: 0, removed: 0, embedder: embedder.id,
  };

  const existing = new Map<string, { id: number; hash: string }>();
  for (const row of db.prepare("SELECT id, path, hash FROM files").all() as Array<{
    id: number; path: string; hash: string;
  }>) {
    existing.set(row.path, { id: row.id, hash: row.hash });
  }

  const seen = new Set<string>();
  const insFile = db.prepare("INSERT INTO files(path, hash, lang) VALUES (?, ?, ?)");
  const updFile = db.prepare("UPDATE files SET hash = ?, lang = ? WHERE id = ?");
  const delNodes = db.prepare("DELETE FROM nodes WHERE file_id = ?");
  const delEdges = db.prepare("DELETE FROM edges WHERE src_file_id = ?");
  const insNode = db.prepare(
    `INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte, parent_id, signature)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insEdge = db.prepare(
    `INSERT INTO edges(src_node_id, src_file_id, dst_name, kind, line) VALUES (?, ?, ?, ?, ?)`
  );
  const insEmbed = db.prepare(
    `INSERT OR REPLACE INTO node_embeddings(node_id, dim, model, vec) VALUES (?, ?, ?, ?)`
  );

  const allFiles = [...walkFiles(projectPath)];
  db.exec("BEGIN");
  try {
    let done = 0;
    for (const filePath of allFiles) {
      const rel = path.relative(projectPath, filePath);
      done++;
      if (onProgress) onProgress({ file: rel, done, total: allFiles.length });
      seen.add(rel);
      const lang = langForPath(filePath)!;
      let content: string;
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_BYTES) continue;
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      const hash = hashOf(content);
      const prior = existing.get(rel);
      if (prior && prior.hash === hash) {
        stats.unchanged++;
        continue;
      }

      let fileId: number;
      if (prior) {
        updFile.run(hash, lang.id, prior.id);
        delNodes.run(prior.id);
        delEdges.run(prior.id);
        fileId = prior.id;
      } else {
        fileId = Number(insFile.run(rel, hash, lang.id).lastInsertRowid);
      }

      const { symbols, refs } = await extract(content, lang);
      const nodeIds: number[] = [];
      for (const s of symbols) {
        const parentId = s.parentIndex !== null ? nodeIds[s.parentIndex]! : null;
        const id = Number(
          insNode.run(
            fileId, s.name, s.kind, s.startLine, s.endLine,
            s.startByte, s.endByte, parentId, s.signature
          ).lastInsertRowid
        );
        nodeIds.push(id);
        // embed the node from its name + signature (cheap, meaningful text)
        const vec = await embedder.embed(`${s.kind} ${s.name} ${s.signature ?? ""}`);
        insEmbed.run(id, embedder.dim, embedder.id, toBlob(vec));
        stats.embeddings++;
      }
      for (const r of refs) {
        const srcId = r.ownerIndex !== null ? nodeIds[r.ownerIndex]! : null;
        insEdge.run(srcId, fileId, r.name, r.kind, r.line);
        stats.edges++;
      }
      stats.files++;
      stats.nodes += symbols.length;
    }

    // prune files that no longer exist
    for (const [rel, row] of existing) {
      if (!seen.has(rel)) {
        db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
        stats.removed++;
      }
    }

    // resolve call edges to node definitions by name match
    db.exec(`
      UPDATE edges SET dst_node_id = (
        SELECT n.id FROM nodes n
        WHERE n.name = edges.dst_name
        LIMIT 1
      )
      WHERE kind = 'call' AND dst_node_id IS NULL
    `);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.close();
  }
  return stats;
}
