import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { openDb, clearNeedsReindex } from "./db.js";
import { langForPath } from "./languages.js";
import { extract } from "./extract.js";
import { getEmbedder, toBlob } from "./embedder.js";
import { loadAffectedConfig, isTestPath, inferModule } from "./affected-config.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-test",
  "build",
  ".next",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".speclaw",
  ".mypy_cache",
  ".pytest_cache",
  "vendor",
  "target",
  ".turbo",
  ".cache",
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

/**
 * Point import edges at a representative node in the imported file so reverse
 * reachability can walk file-level dependencies (not just calls).
 */
function resolveImportEdges(db: ReturnType<typeof openDb>, projectPath: string): void {
  const files = db.prepare("SELECT id, path FROM files").all() as Array<{
    id: number;
    path: string;
  }>;
  const byNorm = new Map<string, number>();
  for (const f of files) {
    byNorm.set(f.path.split("\\").join("/"), f.id);
  }
  const firstNode = db.prepare(
    "SELECT id FROM nodes WHERE file_id = ? ORDER BY start_line ASC, id ASC LIMIT 1",
  );
  const namedNode = db.prepare(
    "SELECT id FROM nodes WHERE file_id = ? AND name = ? ORDER BY id ASC LIMIT 1",
  );
  const upd = db.prepare("UPDATE edges SET dst_node_id = ? WHERE id = ?");

  const imports = db
    .prepare(
      `SELECT e.id, e.dst_name, e.src_file_id, f.path AS src_path
       FROM edges e JOIN files f ON f.id = e.src_file_id
       WHERE e.kind = 'import' AND e.dst_node_id IS NULL`,
    )
    .all() as Array<{ id: number; dst_name: string; src_file_id: number; src_path: string }>;

  for (const edge of imports) {
    const spec = parseImportSpecifier(edge.dst_name);
    if (!spec) continue;
    const targetRel = resolveImportPath(projectPath, edge.src_path, spec.from);
    if (!targetRel) continue;
    const fileId = byNorm.get(targetRel);
    if (fileId === undefined) continue;

    let nodeId: number | undefined;
    for (const name of spec.names) {
      const row = namedNode.get(fileId, name) as { id: number } | undefined;
      if (row) {
        nodeId = row.id;
        break;
      }
    }
    if (nodeId === undefined) {
      const row = firstNode.get(fileId) as { id: number } | undefined;
      nodeId = row?.id;
    }
    if (nodeId !== undefined) upd.run(nodeId, edge.id);
  }
}

/** Pull `from` path and optional named imports out of a raw import statement text. */
function parseImportSpecifier(text: string): { from: string; names: string[] } | null {
  const fromMatch =
    text.match(/\bfrom\s+['"]([^'"]+)['"]/) ?? text.match(/require\s*\(\s*['"]([^'"]+)['"]/);
  if (!fromMatch) return null;
  const from = fromMatch[1]!;
  const names: string[] = [];
  const brace = text.match(/\{([^}]+)\}/);
  if (brace) {
    for (const part of brace[1]!.split(",")) {
      const id = part
        .trim()
        .split(/\s+as\s+/i)[0]!
        .trim();
      if (id && /^[A-Za-z_$][\w$]*$/.test(id)) names.push(id);
    }
  }
  const def = text.match(/\bimport\s+([A-Za-z_$][\w$]*)\s+/);
  if (def && !text.includes("{")) names.push(def[1]!);
  return { from, names };
}

/**
 * Resolve a relative/absolute-ish import specifier to a project-relative indexed path.
 */
function resolveImportPath(projectPath: string, srcRel: string, spec: string): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // bare package — skip
  const srcDir = path.dirname(path.join(projectPath, srcRel));
  const absBase = path.resolve(srcDir, spec);
  const candidates = [
    absBase,
    absBase.replace(/\.js$/, ".ts"),
    absBase.replace(/\.js$/, ".tsx"),
    absBase.replace(/\.jsx$/, ".tsx"),
    `${absBase}.ts`,
    `${absBase}.tsx`,
    `${absBase}.js`,
    `${absBase}.jsx`,
    `${absBase}.mjs`,
    `${absBase}.cjs`,
    path.join(absBase, "index.ts"),
    path.join(absBase, "index.js"),
  ];
  for (const abs of candidates) {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    return path.relative(projectPath, abs).split("\\").join("/");
  }
  // Fall back without existence check — strip a trailing .js for TS sources.
  let rel = path.relative(projectPath, absBase).split("\\").join("/");
  if (rel.endsWith(".js")) rel = rel.slice(0, -3) + ".ts";
  else if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) rel = `${rel}.ts`;
  return rel.replace(/^\.\//, "");
}

/**
 * Infer a covering artifact's type from its project-relative path.
 * Full glob config lives in lawbook; this is the indexer default so links are
 * typed even before a coverage report runs.
 */
function inferSourceType(relPath: string): string {
  const p = relPath.split("\\").join("/");
  if (/(^|\/)test\/integration\//.test(p) || /(^|\/)tests\/integration\//.test(p)) return "itest";
  if (
    /(^|\/)test\/unit\//.test(p) ||
    /(^|\/)tests\/unit\//.test(p) ||
    /\.test\.[cm]?[jt]sx?$/.test(p) ||
    /\.spec\.[cm]?[jt]sx?$/.test(p) ||
    /(^|\/)test\//.test(p)
  ) {
    return "utest";
  }
  return "impl";
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
  onProgress?: ProgressFn,
): Promise<IndexStats> {
  const db = openDb(projectPath);
  const embedder = getEmbedder();
  const stats: IndexStats = {
    files: 0,
    nodes: 0,
    edges: 0,
    embeddings: 0,
    unchanged: 0,
    removed: 0,
    embedder: embedder.id,
  };

  const cfg = loadAffectedConfig(projectPath);
  const existing = new Map<string, { id: number; hash: string }>();
  for (const row of db.prepare("SELECT id, path, hash FROM files").all() as Array<{
    id: number;
    path: string;
    hash: string;
  }>) {
    existing.set(row.path, { id: row.id, hash: row.hash });
  }

  const seen = new Set<string>();
  const insFile = db.prepare(
    "INSERT INTO files(path, hash, lang, is_test, module) VALUES (?, ?, ?, ?, ?)",
  );
  const updFile = db.prepare(
    "UPDATE files SET hash = ?, lang = ?, is_test = ?, module = ? WHERE id = ?",
  );
  const delNodes = db.prepare("DELETE FROM nodes WHERE file_id = ?");
  const delEdges = db.prepare("DELETE FROM edges WHERE src_file_id = ?");
  const delCoverage = db.prepare("DELETE FROM coverage_links WHERE file_path = ?");
  const insNode = db.prepare(
    `INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte, parent_id, signature, body_hash, norm_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insMetrics = db.prepare(
    `INSERT INTO node_metrics(node_id, loc, max_nesting, branches) VALUES (?, ?, ?, ?)`,
  );
  const insEdge = db.prepare(
    `INSERT INTO edges(src_node_id, src_file_id, dst_name, kind, line) VALUES (?, ?, ?, ?, ?)`,
  );
  const insCoverage = db.prepare(
    `INSERT OR REPLACE INTO coverage_links(
       artifact_type, name, revision, kind, file_path, line, node_id, source_type, origin
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insEmbed = db.prepare(
    `INSERT OR REPLACE INTO node_embeddings(node_id, dim, model, vec) VALUES (?, ?, ?, ?)`,
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
      const isTest = isTestPath(rel, cfg.testGlobs) ? 1 : 0;
      const mod = inferModule(rel);
      if (prior) {
        updFile.run(hash, lang.id, isTest, mod, prior.id);
        delNodes.run(prior.id);
        delEdges.run(prior.id);
        delCoverage.run(rel);
        fileId = prior.id;
      } else {
        fileId = Number(insFile.run(rel, hash, lang.id, isTest, mod).lastInsertRowid);
      }

      const { symbols, refs, coverage } = await extract(content, lang);
      const nodeIds: number[] = [];
      for (const s of symbols) {
        const parentId = s.parentIndex !== null ? nodeIds[s.parentIndex]! : null;
        const id = Number(
          insNode.run(
            fileId,
            s.name,
            s.kind,
            s.startLine,
            s.endLine,
            s.startByte,
            s.endByte,
            parentId,
            s.signature,
            s.bodyHash,
            s.normHash,
          ).lastInsertRowid,
        );
        nodeIds.push(id);
        insMetrics.run(id, s.loc, s.maxNesting, s.branches);
        // embed the node from its name + signature (cheap, meaningful text)
        const vec = await embedder.embed(`${s.kind} ${s.name} ${s.signature ?? ""}`);
        insEmbed.run(id, embedder.dim, embedder.id, toBlob(vec));
        stats.embeddings++;
      }
      // Prefer a real symbol as import owner when the AST leaves imports file-scoped.
      const fileOwner = nodeIds[0] ?? null;
      for (const r of refs) {
        let srcId = r.ownerIndex !== null ? nodeIds[r.ownerIndex]! : null;
        if (srcId === null && r.kind === "import") srcId = fileOwner;
        insEdge.run(srcId, fileId, r.name, r.kind, r.line);
        stats.edges++;
      }
      const sourceType = inferSourceType(rel);
      for (const c of coverage) {
        const nodeId = c.ownerIndex !== null ? nodeIds[c.ownerIndex]! : null;
        insCoverage.run(
          c.artifactType,
          c.name,
          c.revision,
          c.kind,
          rel,
          c.line,
          nodeId,
          sourceType,
          "comment",
        );
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

    // Prefer same-file callees so colliding names across files do not share one id.
    db.exec(`
      UPDATE edges SET dst_node_id = (
        SELECT n.id FROM nodes n
        WHERE n.name = edges.dst_name
        ORDER BY CASE WHEN n.file_id = edges.src_file_id THEN 0 ELSE 1 END, n.id
        LIMIT 1
      )
      WHERE kind = 'call' AND dst_node_id IS NULL
    `);

    resolveImportEdges(db, projectPath);

    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('indexed_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(new Date().toISOString());
    clearNeedsReindex(db);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.close();
  }

  // Compact map in committed docs/compass.md (between markers) — zero tool-call cost.
  try {
    const { writeCompactMap } = await import("./map.js");
    writeCompactMap(projectPath);
  } catch {
    // Map generation must never fail an index run.
  }

  return stats;
}
