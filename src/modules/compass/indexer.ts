import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { openDb, clearNeedsReindex, needsReindex, FILE_NODE_KIND } from "./db.js";
import { langForPath } from "./languages.js";
import { extract, importSpecifier } from "./extract.js";
import { getEmbedder, toBlob } from "./embedder.js";
import { contentHashFor, defaultEmbedText } from "./embed-input.js";
import { buildDirHashMap } from "./merkle.js";
import { loadAffectedConfig, isTestPath, inferModule } from "./affected-config.js";
import { personalizedPageRank, edgeWeightMul, type PrEdge } from "./pagerank.js";
import type { DatabaseSync } from "node:sqlite";
import type { Embedder } from "./embedder.js";

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
  /** @deprecated Prefer computed + fromCache */
  embeddings: number;
  computed: number;
  fromCache: number;
  unchanged: number;
  skippedByStat: number;
  removed: number;
  rootUnchanged: boolean;
  embedder: string;
  /** Whole-repository row counts after the run (not the delta). */
  totals: { files: number; nodes: number; edges: number };
  /** One-line hint pointing the agent at the query tools. */
  nextStep: string;
}

/** Options for {@link buildIndex}. */
export interface BuildIndexOptions {
  force?: boolean;
  prune?: boolean;
  maxCacheMB?: number;
  retentionDays?: number;
  onProgress?: ProgressFn;
}

function hashOf(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const DEFAULT_MAX_CACHE_MB = 256;
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Call names that are ambient globals in common runtimes and test frameworks.
 * A plain call to one of them binds only to a definition in the same file, so
 * a project symbol that happens to share the name never collects every test
 * file as a caller.
 */
export const BUILTIN_GLOBALS: readonly string[] = [
  "describe",
  "it",
  "test",
  "expect",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "queueMicrotask",
  "parseInt",
  "parseFloat",
  "require",
  "structuredClone",
  "fetch",
  "print",
  "len",
  "isinstance",
  "super",
];

/** {@link BUILTIN_GLOBALS} as a quoted SQL `IN (...)` list. */
export const BUILTIN_SQL_LIST = BUILTIN_GLOBALS.map((n) => `'${n}'`).join(", ");

/** Most bind parameters a scoped {@link resolveEdges} call uses before running unscoped. */
const MAX_SCOPE_PARAMS = 10_000;

/** Counts of edges newly resolved by one {@link resolveEdges} call. */
export interface ResolveEdgesStats {
  calls: number;
  imports: number;
}

/**
 * Resolve call and import edges to node ids — the one place edge resolution
 * lives, shared by the full index run and incremental re-indexing.
 *
 * - Edges whose `dst_node_id` points at a node that no longer exists (its file
 *   was re-extracted) are reset to unresolved first.
 * - Imports are resolved first (below). A call's "import target" is the file
 *   the same-file import edge with the call's `spec` resolved to.
 * - Calls with `is_member = 1` are never resolved by name. Calls with
 *   `is_member = 2` (a member call on an import binding) resolve only when their
 *   import target exists: an import that no relative/alias/baseUrl resolution
 *   maps to a project file is a package, so `path.parse()` stays foreign.
 * - A call to a {@link BUILTIN_GLOBALS} name resolves only to a definition in
 *   the same file or in its import target (`import { fetch } from "./http"`).
 * - Otherwise a call prefers its import target, then a definition under the
 *   import target's directory (a barrel's subtree), then a same-file
 *   definition, else the lowest-id node with that name. File-owner nodes are
 *   never call targets. An import of a symbol-less or re-exporting file (a
 *   barrel) resolves to that file's file-owner node, so member calls through
 *   it bind by name like this.
 * - Imports resolve their specifier relative to the importing file, then
 *   through the nearest `tsconfig.json`/`jsconfig.json` `paths`/`baseUrl`, and
 *   point at the target file's file-owner node when it has one, otherwise at
 *   its first node by `start_line`.
 *
 * The project root is read from the database's own path
 * (`<root>/.speclaw/index.db`), so callers pass only the connection.
 *
 * @param db - Open index database (the caller owns the transaction).
 * @param fileIds - When set, only calls owned by these files or by files whose
 * import this pass resolved, and unresolved calls whose name a node in these
 * files defines; unresolved imports are always all processed (a new file may
 * satisfy any of them). When omitted, every
 * unresolved edge.
 * @returns How many call and import edges this call resolved.
 */
export function resolveEdges(db: DatabaseSync, fileIds?: number[]): ResolveEdgesStats {
  // Covers: req~impact-id-first~1
  db.exec(
    `UPDATE edges SET dst_node_id = NULL
     WHERE dst_node_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = edges.dst_node_id)`,
  );
  const scoped = fileIds !== undefined;
  const ids = fileIds ?? [];
  const idList = ids.map(() => "?").join(", ") || "NULL";
  const resolvedCalls = (): number =>
    Number(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM edges WHERE kind = 'call' AND dst_node_id IS NOT NULL",
          )
          .get() as { n: number }
      ).n,
    );

  // Imports first: whether a call on an import binding may bind depends on
  // whether that binding's import resolved to a project file.
  const { resolved: imports, srcFiles } = resolveImportEdges(db, projectRootOf(db));
  const before = resolvedCalls();
  // A file whose import just resolved may have pending is_member = 2 calls.
  // Past a bound (SQLite caps bind parameters) the pass is simply unscoped.
  const importScope = [...srcFiles];
  const importList = importScope.map(() => "?").join(", ") || "NULL";
  const narrow = scoped && 2 * ids.length + importScope.length <= MAX_SCOPE_PARAMS;
  const callScope = narrow
    ? `AND (src_file_id IN (${idList}) OR src_file_id IN (${importList})
          OR dst_name IN (SELECT name FROM nodes WHERE file_id IN (${idList}) AND kind <> '${FILE_NODE_KIND}'))`
    : "";
  // File of the node the same-file import with this call's spec resolved to;
  // NULL when the call has no spec (the subquery is skipped) or that import
  // stayed unresolved (a package).
  const importTarget = `(CASE WHEN edges.spec IS NULL THEN NULL ELSE (
       SELECT t.file_id FROM edges i JOIN nodes t ON t.id = i.dst_node_id
       WHERE i.src_file_id = edges.src_file_id AND i.kind = 'import' AND i.spec = edges.spec
       ORDER BY i.id LIMIT 1) END)`;
  // Candidate n lies under the import target's directory: a barrel
  // (`libs/core/src/index.ts`) usually re-exports its own subtree, so this
  // stands in for "reachable through the barrel's re-exports" without storing
  // them. rtrim(p, <p without '/'>) is p's directory with its trailing slash.
  const underTargetDir = `EXISTS (
       SELECT 1 FROM files tf, files nf
       WHERE tf.id = ${importTarget} AND nf.id = n.file_id
         AND substr(nf.path, 1, length(rtrim(tf.path, replace(tf.path, '/', ''))))
             = rtrim(tf.path, replace(tf.path, '/', '')))`;
  db.prepare(
    `UPDATE edges SET dst_node_id = (
       SELECT n.id FROM nodes n
       WHERE n.name = edges.dst_name
         AND n.kind <> '${FILE_NODE_KIND}'
         AND (edges.dst_name NOT IN (${BUILTIN_SQL_LIST}) OR n.file_id = edges.src_file_id
              OR n.file_id = ${importTarget})
       ORDER BY CASE WHEN n.file_id = ${importTarget} THEN 0
                     WHEN edges.spec IS NOT NULL AND ${underTargetDir} THEN 1
                     WHEN n.file_id = edges.src_file_id THEN 2 ELSE 3 END, n.id
       LIMIT 1
     )
     WHERE kind = 'call' AND dst_node_id IS NULL
       AND (is_member = 0
            OR (is_member = 2 AND edges.spec IS NOT NULL AND ${importTarget} IS NOT NULL))
       ${callScope}`,
  ).run(...(narrow ? [...ids, ...importScope, ...ids] : []));
  const calls = resolvedCalls() - before;
  return { calls, imports };
}

/** Project root of an index database stored at `<root>/.speclaw/index.db`. */
function projectRootOf(db: DatabaseSync): string {
  const row = db.prepare("SELECT file FROM pragma_database_list WHERE name = 'main'").get() as
    { file: string } | undefined;
  return path.dirname(path.dirname(row?.file ?? ""));
}

/**
 * Point every unresolved import edge at a representative node of the imported
 * file (its file-owner node, else its first node) so reverse reachability walks
 * file-level dependencies, not just calls. Not narrowed by file: a newly
 * indexed file can satisfy an import anywhere.
 *
 * @returns How many import edges were resolved, and the importing files' ids.
 */
function resolveImportEdges(
  db: DatabaseSync,
  projectPath: string,
): { resolved: number; srcFiles: Set<number> } {
  // Covers: req~import-resolution~1
  const files = db.prepare("SELECT id, path FROM files").all() as Array<{
    id: number;
    path: string;
  }>;
  const byNorm = new Map<string, number>();
  for (const f of files) byNorm.set(f.path.split("\\").join("/"), f.id);
  const target = db.prepare(
    `SELECT id FROM nodes WHERE file_id = ?
     ORDER BY kind = '${FILE_NODE_KIND}' DESC, start_line ASC, id ASC LIMIT 1`,
  );
  const upd = db.prepare("UPDATE edges SET dst_node_id = ? WHERE id = ?");

  const imports = db
    .prepare(
      `SELECT e.id, e.dst_name, e.spec, e.src_file_id, f.path AS src_path
       FROM edges e JOIN files f ON f.id = e.src_file_id
       WHERE e.kind = 'import' AND e.dst_node_id IS NULL`,
    )
    .all() as Array<{
    id: number;
    dst_name: string;
    spec: string | null;
    src_file_id: number;
    src_path: string;
  }>;

  const aliases = new AliasResolver(projectPath);
  let resolved = 0;
  const srcFiles = new Set<number>();
  for (const edge of imports) {
    const spec = edge.spec ?? importSpecifier(edge.dst_name);
    if (!spec) continue;
    const targetRel = resolveImportPath(projectPath, edge.src_path, spec, byNorm, aliases);
    if (!targetRel) continue;
    const fileId = byNorm.get(targetRel);
    if (fileId === undefined) continue;
    const row = target.get(fileId) as { id: number } | undefined;
    if (!row) continue;
    upd.run(row.id, edge.id);
    resolved++;
    srcFiles.add(edge.src_file_id);
  }
  return { resolved, srcFiles };
}

/** Repo-relative candidate files for an import target (extension and index probing). */
function importCandidates(projectPath: string, absBase: string): string[] {
  const rel = path.relative(projectPath, absBase).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return [];
  return [
    rel,
    rel.replace(/\.js$/, ".ts"),
    rel.replace(/\.js$/, ".tsx"),
    rel.replace(/\.jsx$/, ".tsx"),
    rel.replace(/\.mjs$/, ".mts"),
    rel.replace(/\.cjs$/, ".cts"),
    `${rel}.ts`,
    `${rel}.tsx`,
    `${rel}.js`,
    `${rel}.jsx`,
    `${rel}.mjs`,
    `${rel}.cjs`,
    `${rel}/index.ts`,
    `${rel}/index.tsx`,
    `${rel}/index.js`,
  ];
}

/**
 * Resolve an import specifier to an indexed repo-relative path: relative
 * specifiers against the importing file (including `.js` → `.ts`), then
 * tsconfig/jsconfig `paths` aliases and bare `baseUrl` lookups. Bare package
 * names that match no project file stay unresolved (null).
 */
function resolveImportPath(
  projectPath: string,
  srcRel: string,
  spec: string,
  indexed: Map<string, number>,
  aliases: AliasResolver,
): string | null {
  const firstIndexed = (absBase: string): string | null =>
    importCandidates(projectPath, absBase).find((c) => indexed.has(c)) ?? null;
  const srcDir = path.dirname(path.join(projectPath, srcRel));
  if (spec.startsWith(".") || spec.startsWith("/")) {
    return firstIndexed(path.resolve(srcDir, spec));
  }
  for (const absBase of aliases.candidates(srcDir, spec)) {
    const hit = firstIndexed(absBase);
    if (hit) return hit;
  }
  return null;
}

/** Effective `paths`/`baseUrl` of one tsconfig, with absolute bases. */
interface AliasConfig {
  /** Absolute `baseUrl`, when one is set anywhere in the `extends` chain. */
  baseUrl?: string;
  /** `paths` patterns, longest literal prefix first. */
  paths: Array<{ pattern: string; targets: string[] }>;
  /** Directory `paths` targets resolve against when `baseUrl` is absent. */
  pathsBase: string;
}

/**
 * Best-effort tsconfig/jsconfig alias lookup, cached per directory for one
 * resolution pass. Never throws: an unreadable or malformed config disables
 * alias resolution for the files under it, and relative imports still resolve.
 */
class AliasResolver {
  private readonly byDir = new Map<string, AliasConfig | null>();

  constructor(private readonly root: string) {}

  /** Absolute import bases to probe for a non-relative specifier, in order. */
  candidates(fromDir: string, spec: string): string[] {
    const cfg = this.configFor(fromDir);
    if (!cfg) return [];
    const out: string[] = [];
    for (const { pattern, targets } of cfg.paths) {
      const star = pattern.indexOf("*");
      let captured: string | null = null;
      if (star < 0) {
        if (spec === pattern) captured = "";
      } else {
        const pre = pattern.slice(0, star);
        const post = pattern.slice(star + 1);
        if (
          spec.startsWith(pre) &&
          spec.endsWith(post) &&
          spec.length >= pre.length + post.length
        ) {
          captured = spec.slice(pre.length, spec.length - post.length);
        }
      }
      if (captured === null) continue;
      for (const t of targets) {
        out.push(path.resolve(cfg.baseUrl ?? cfg.pathsBase, t.replace("*", captured)));
      }
    }
    if (cfg.baseUrl) out.push(path.resolve(cfg.baseUrl, spec));
    return out;
  }

  /** Nearest tsconfig/jsconfig at or above `dir`, bounded by the project root. */
  private configFor(dir: string): AliasConfig | null {
    const cached = this.byDir.get(dir);
    if (cached !== undefined) return cached;
    let result: AliasConfig | null = null;
    const rel = path.relative(this.root, dir);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      const own = ["tsconfig.json", "jsconfig.json"]
        .map((n) => path.join(dir, n))
        .find((f) => fs.existsSync(f));
      if (own) result = loadAliasConfig(own, this.root);
      else if (dir !== this.root) result = this.configFor(path.dirname(dir));
    }
    this.byDir.set(dir, result);
    return result;
  }
}

/**
 * Strip `//` and block comments and trailing commas from JSONC text, leaving
 * string literals untouched.
 */
export function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (ch === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close < 0 ? text.length : close + 2;
    } else {
      out += ch;
      i++;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Read a tsconfig and its relative `extends` chain (max depth 5, cycle-safe,
 * inside the project root). The nearest definition of `baseUrl` and of `paths`
 * wins, each resolved against the config file that declares it.
 *
 * @returns The effective alias config, or null when the file cannot be parsed.
 */
function loadAliasConfig(file: string, root: string): AliasConfig | null {
  let baseUrl: string | undefined;
  let paths: Record<string, string[]> | undefined;
  let pathsBase = path.dirname(file);
  const seen = new Set<string>();
  let current: string | null = file;
  for (let depth = 0; current && depth < 6 && !seen.has(current); depth++) {
    seen.add(current);
    let parsed: { extends?: unknown; compilerOptions?: { baseUrl?: unknown; paths?: unknown } };
    try {
      parsed = JSON.parse(stripJsonComments(fs.readFileSync(current, "utf8"))) as typeof parsed;
    } catch {
      if (depth === 0) return null;
      break;
    }
    const dir = path.dirname(current);
    const co = parsed.compilerOptions ?? {};
    if (baseUrl === undefined && typeof co.baseUrl === "string") {
      baseUrl = path.resolve(dir, co.baseUrl);
    }
    if (paths === undefined && co.paths && typeof co.paths === "object") {
      paths = co.paths as Record<string, string[]>;
      pathsBase = dir;
    }
    current = null;
    if (typeof parsed.extends === "string" && parsed.extends.startsWith(".")) {
      let next = path.resolve(dir, parsed.extends);
      if (!next.endsWith(".json")) next += ".json";
      const rel = path.relative(root, next);
      if (!rel.startsWith("..") && !path.isAbsolute(rel) && fs.existsSync(next)) current = next;
    }
  }
  const entries = Object.entries(paths ?? {})
    .filter(([, t]) => Array.isArray(t))
    .map(([pattern, targets]) => ({
      pattern,
      targets: targets.filter((t): t is string => typeof t === "string"),
    }))
    .sort((a, b) => b.pattern.split("*")[0]!.length - a.pattern.split("*")[0]!.length);
  return { baseUrl, paths: entries, pathsBase };
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
 * Uses a stat prefilter and directory Merkle tree to avoid unnecessary reads,
 * and an embedding cache keyed by embedder-input hash so renames/moves do not
 * recompute vectors. The whole run executes in a single transaction.
 *
 * A run without force, prune, or an explicit `maxCacheMB` that re-extracts and
 * removes nothing and finds the root hash unchanged is a no-op: it skips the
 * dir-hash rewrite, edge/import resolution, PageRank, and the embedding-cache
 * touch and eviction, writes only `meta.indexed_at`, and rewrites
 * `docs/compass.md` only when its map block is empty. It still returns full
 * statistics (`totals`, `nextStep`).
 *
 * @param projectPath - Absolute path to the project root.
 * @param onProgressOrOpts - Progress callback (legacy) or {@link BuildIndexOptions}.
 */
export async function buildIndex(
  projectPath: string,
  onProgressOrOpts?: ProgressFn | BuildIndexOptions,
): Promise<IndexStats> {
  const opts: BuildIndexOptions =
    typeof onProgressOrOpts === "function"
      ? { onProgress: onProgressOrOpts }
      : (onProgressOrOpts ?? {});
  const onProgress = opts.onProgress;
  const prune = Boolean(opts.prune);
  const maxCacheMB = opts.maxCacheMB ?? DEFAULT_MAX_CACHE_MB;
  const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;

  const db = openDb(projectPath);
  const force = Boolean(opts.force) || needsReindex(db);
  const embedder = getEmbedder();
  const stats: IndexStats = {
    files: 0,
    nodes: 0,
    edges: 0,
    embeddings: 0,
    computed: 0,
    fromCache: 0,
    unchanged: 0,
    skippedByStat: 0,
    removed: 0,
    rootUnchanged: false,
    embedder: embedder.id,
    totals: { files: 0, nodes: 0, edges: 0 },
    nextStep: "",
  };

  const cfg = loadAffectedConfig(projectPath);
  const existing = new Map<
    string,
    { id: number; hash: string; mtime_ms: number | null; size: number | null }
  >();
  for (const row of db.prepare("SELECT id, path, hash, mtime_ms, size FROM files").all() as Array<{
    id: number;
    path: string;
    hash: string;
    mtime_ms: number | null;
    size: number | null;
  }>) {
    existing.set(row.path, {
      id: row.id,
      hash: row.hash,
      mtime_ms: row.mtime_ms,
      size: row.size,
    });
  }

  const prevRoot = db.prepare("SELECT hash FROM dir_hashes WHERE path = ''").get() as
    { hash: string } | undefined;

  const seen = new Set<string>();
  const fileHashes = new Map<string, string>();
  const insFile = db.prepare(
    "INSERT INTO files(path, hash, lang, is_test, module, mtime_ms, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const updFile = db.prepare(
    "UPDATE files SET hash = ?, lang = ?, is_test = ?, module = ?, mtime_ms = ?, size = ? WHERE id = ?",
  );
  const delNodes = db.prepare("DELETE FROM nodes WHERE file_id = ?");
  const delEdges = db.prepare("DELETE FROM edges WHERE src_file_id = ?");
  const delCoverage = db.prepare("DELETE FROM coverage_links WHERE file_path = ?");
  const insNode = db.prepare(
    `INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte, parent_id, signature, body_hash, norm_hash, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insMetrics = db.prepare(
    `INSERT INTO node_metrics(node_id, loc, max_nesting, branches) VALUES (?, ?, ?, ?)`,
  );
  const insEdge = db.prepare(
    `INSERT INTO edges(src_node_id, src_file_id, dst_name, kind, line, is_member, spec) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insCoverage = db.prepare(
    `INSERT OR REPLACE INTO coverage_links(
       artifact_type, name, revision, kind, file_path, line, node_id, source_type, origin
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insCache = db.prepare(
    `INSERT INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(content_hash, model) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
  );
  const hasCache = db.prepare(
    `SELECT 1 AS ok FROM embedding_cache WHERE content_hash = ? AND model = ?`,
  );
  const insNodeText = db.prepare(
    `INSERT INTO node_text(node_id, name, subtokens, signature, doc) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       name = excluded.name,
       subtokens = excluded.subtokens,
       signature = excluded.signature,
       doc = excluded.doc`,
  );

  const allFiles = [...walkFiles(projectPath)];
  // Set inside the transaction; read after it to decide whether the map is written.
  let noop: boolean | undefined;
  db.exec("BEGIN");
  try {
    let done = 0;
    for (const filePath of allFiles) {
      const rel = path.relative(projectPath, filePath).split(path.sep).join("/");
      done++;
      if (onProgress) onProgress({ file: rel, done, total: allFiles.length });
      seen.add(rel);
      const lang = langForPath(filePath)!;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }

      const prior = existing.get(rel);
      const mtimeMs = Math.trunc(stat.mtimeMs);
      const size = stat.size;

      if (
        !force &&
        prior &&
        prior.mtime_ms != null &&
        prior.size != null &&
        prior.mtime_ms === mtimeMs &&
        prior.size === size
      ) {
        fileHashes.set(rel, prior.hash);
        stats.skippedByStat++;
        stats.unchanged++;
        continue;
      }

      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      const hash = hashOf(content);
      fileHashes.set(rel, hash);

      if (!force && prior && prior.hash === hash) {
        updFile.run(
          hash,
          lang.id,
          isTestPath(rel, cfg.testGlobs) ? 1 : 0,
          inferModule(rel),
          mtimeMs,
          size,
          prior.id,
        );
        stats.unchanged++;
        continue;
      }

      let fileId: number;
      const isTest = isTestPath(rel, cfg.testGlobs) ? 1 : 0;
      const mod = inferModule(rel);
      if (prior) {
        updFile.run(hash, lang.id, isTest, mod, mtimeMs, size, prior.id);
        delNodes.run(prior.id);
        delEdges.run(prior.id);
        delCoverage.run(rel);
        fileId = prior.id;
      } else {
        fileId = Number(
          insFile.run(rel, hash, lang.id, isTest, mod, mtimeMs, size).lastInsertRowid,
        );
      }

      const { symbols, refs, coverage, reexports } = await extract(content, lang);
      const nodeIds: number[] = [];
      const now = Date.now();
      const touchCache = db.prepare(
        `UPDATE embedding_cache SET last_seen_at = ? WHERE content_hash = ? AND model = ?`,
      );
      for (const s of symbols) {
        const parentId = s.parentIndex !== null ? nodeIds[s.parentIndex]! : null;
        const embedText = defaultEmbedText(s.kind, s.name, s.signature);
        const ch = contentHashFor({
          lang: lang.id,
          kind: s.kind,
          name: s.name,
          signature: s.signature,
          embedText,
        });
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
            ch,
          ).lastInsertRowid,
        );
        nodeIds.push(id);
        insMetrics.run(id, s.loc, s.maxNesting, s.branches);
        insNodeText.run(id, s.name, s.subtokens, s.signature ?? "", s.docstring);

        const hit = hasCache.get(ch, embedder.id) as { ok: number } | undefined;
        if (hit) {
          touchCache.run(now, ch, embedder.id);
          stats.fromCache++;
        } else {
          const vec = await embedder.embed(embedText);
          insCache.run(ch, embedder.id, embedder.dim, toBlob(vec), now, now);
          stats.computed++;
        }
        stats.embeddings++;
      }

      // Covers: req~impact-id-first~1
      // Imports and calls outside any definition belong to the file: give the
      // file one hidden owner node so no edge is ever stored ownerless. A file
      // with no symbols or with re-exports (a barrel: `export * from "./x"`)
      // gets one too, so an import of it resolves to the file instead of
      // looking like a package. It gets no text, embedding, or metrics.
      const isOrphan = (r: (typeof refs)[number]): boolean =>
        r.kind === "import" || r.ownerIndex === null;
      let fileOwner: number | null = null;
      if (refs.some(isOrphan) || symbols.length === 0 || reexports.length > 0) {
        const lastLine = content.length === 0 ? 1 : content.replace(/\n$/, "").split("\n").length;
        fileOwner = Number(
          insNode.run(
            fileId,
            rel,
            FILE_NODE_KIND,
            1,
            lastLine,
            0,
            content.length,
            null,
            null,
            null,
            null,
            null,
          ).lastInsertRowid,
        );
      }
      for (const r of refs) {
        const srcId = isOrphan(r) ? fileOwner : nodeIds[r.ownerIndex!]!;
        insEdge.run(srcId, fileId, r.name, r.kind, r.line, r.member, r.spec);
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

    for (const [rel, row] of existing) {
      if (!seen.has(rel)) {
        db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
        stats.removed++;
      } else if (!fileHashes.has(rel)) {
        fileHashes.set(rel, row.hash);
      }
    }

    const dirMap = buildDirHashMap(fileHashes);
    const rootHash = dirMap.get("") ?? "";
    stats.rootUnchanged = Boolean(
      prevRoot && prevRoot.hash === rootHash && !force && stats.files === 0,
    );

    // Covers: req~index-noop-fast-path~1
    // No-op fast path: nothing re-extracted or removed and the same root means
    // dir hashes, edges, PageRank, and the cache are already what a full pass
    // would write — skip them so a run on every session start stays cheap.
    // `rootUnchanged` already implies no force (explicit or needs_reindex); an
    // explicit prune or cache cap is a maintenance request and runs in full.
    noop = stats.rootUnchanged && !prune && opts.maxCacheMB === undefined && stats.removed === 0;

    if (!noop) {
      const now = Date.now();
      db.prepare("DELETE FROM dir_hashes").run();
      const insDir = db.prepare(
        "INSERT INTO dir_hashes(path, hash, n_files, updated_at) VALUES (?, ?, ?, ?)",
      );
      for (const [dir, hash] of dirMap) {
        const nFiles = [...fileHashes.keys()].filter((f) =>
          dir === "" ? true : f === dir || f.startsWith(dir + "/"),
        ).length;
        insDir.run(dir, hash, nFiles, now);
      }

      resolveEdges(db);

      recomputeGlobalPagerank(db);

      // Touch last_seen for all live content hashes under active model
      db.prepare(
        `UPDATE embedding_cache SET last_seen_at = ?
         WHERE model = ?
           AND content_hash IN (SELECT content_hash FROM nodes WHERE content_hash IS NOT NULL)`,
      ).run(now, embedder.id);

      if (prune) {
        const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
        db.prepare(
          `DELETE FROM embedding_cache
           WHERE last_seen_at < ?
             AND content_hash NOT IN (SELECT content_hash FROM nodes WHERE content_hash IS NOT NULL)`,
        ).run(cutoff);
      }

      evictCacheBySize(db, maxCacheMB);
    }

    // Written on every run, no-op included, so doctor's freshness check sees a
    // verified-current index as fresh.
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('indexed_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(new Date().toISOString());
    if (!noop) clearNeedsReindex(db);

    stats.totals = countTotals(db);
    stats.nextStep = indexNextStep(stats.totals);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.close();
  }

  try {
    const { writeCompactMap, compactMapPending } = await import("./map.js");
    // A no-op run leaves the tracked docs/compass.md alone (no working-tree
    // churn) unless its map block is still empty.
    if (!noop || compactMapPending(projectPath)) writeCompactMap(projectPath);
  } catch {
    // Map generation must never fail an index run.
  }

  return stats;
}

function countTotals(db: DatabaseSync): IndexStats["totals"] {
  const count = (table: string): number =>
    Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
  const nodes = Number(
    (
      db.prepare(`SELECT COUNT(*) AS n FROM nodes WHERE kind <> '${FILE_NODE_KIND}'`).get() as {
        n: number;
      }
    ).n,
  );
  return { files: count("files"), nodes, edges: count("edges") };
}

/** Next-step hint printed after an index run; names the query tools, not grep. */
export function indexNextStep(totals: IndexStats["totals"]): string {
  const fmt = (n: number): string => n.toLocaleString("en-US");
  return (
    `Index ready: ${fmt(totals.files)} files, ${fmt(totals.nodes)} symbols. ` +
    `Next: compass_find "<concept>" or compass_explore <symbol> — do not grep.`
  );
}

function evictCacheBySize(db: DatabaseSync, maxCacheMB: number): void {
  const limitBytes = maxCacheMB * 1024 * 1024;
  const row = db
    .prepare("SELECT COALESCE(SUM(LENGTH(vec)), 0) AS bytes FROM embedding_cache")
    .get() as {
    bytes: number;
  };
  if (row.bytes <= limitBytes) return;
  const target = Math.floor(limitBytes * 0.8);
  let bytes = row.bytes;
  const oldest = db
    .prepare(
      "SELECT content_hash, model, LENGTH(vec) AS len FROM embedding_cache ORDER BY last_seen_at ASC",
    )
    .all() as Array<{ content_hash: string; model: string; len: number }>;
  const del = db.prepare("DELETE FROM embedding_cache WHERE content_hash = ? AND model = ?");
  for (const e of oldest) {
    if (bytes <= target) break;
    del.run(e.content_hash, e.model);
    bytes -= e.len;
  }
}

/**
 * Recompute global (non-personalized) PageRank over the bipartite file↔symbol
 * graph and replace the `pagerank` table.
 *
 * @param db - Open index database.
 */
export function recomputeGlobalPagerank(db: DatabaseSync): void {
  const files = db.prepare("SELECT id, path FROM files").all() as Array<{
    id: number;
    path: string;
  }>;
  // File-owner nodes are not ranked symbols; their outgoing calls count as
  // references from their file in the file–symbol graph.
  const nodes = db
    .prepare(`SELECT id, name, file_id FROM nodes WHERE kind <> '${FILE_NODE_KIND}'`)
    .all() as Array<{
    id: number;
    name: string;
    file_id: number;
  }>;
  if (nodes.length === 0) {
    db.exec("DELETE FROM pagerank");
    return;
  }

  // Use negative ids for files so they never collide with node ids.
  const fileNodeId = (fileId: number) => -fileId;
  const nodeIds: number[] = [];
  for (const f of files) nodeIds.push(fileNodeId(f.id));
  for (const n of nodes) nodeIds.push(n.id);

  const defCount = new Map<string, number>();
  for (const n of nodes) defCount.set(n.name, (defCount.get(n.name) ?? 0) + 1);
  const refCount = new Map<string, number>();
  const callEdges = db
    .prepare(
      `SELECT e.src_node_id, e.src_file_id, src.kind AS src_kind, e.dst_node_id, e.dst_name,
              f.path AS src_path
       FROM edges e
       JOIN files f ON f.id = e.src_file_id
       JOIN nodes src ON src.id = e.src_node_id
       WHERE e.kind = 'call'`,
    )
    .all() as Array<{
    src_node_id: number;
    src_file_id: number;
    src_kind: string;
    dst_node_id: number | null;
    dst_name: string;
    src_path: string;
  }>;
  for (const e of callEdges) {
    refCount.set(e.dst_name, (refCount.get(e.dst_name) ?? 0) + 1);
  }

  const ctx = {
    mentionedIdents: new Set<string>(),
    focusFiles: new Set<string>(),
    defCount,
    refCount,
  };

  const edges: PrEdge[] = [];
  for (const n of nodes) {
    edges.push({ from: fileNodeId(n.file_id), to: n.id, weight: 1 });
  }
  for (const e of callEdges) {
    if (e.dst_node_id == null) continue;
    const w = edgeWeightMul(e.dst_name, e.src_path, ctx);
    const from = e.src_kind === FILE_NODE_KIND ? fileNodeId(e.src_file_id) : e.src_node_id;
    edges.push({ from, to: e.dst_node_id, weight: w });
  }

  const scores = personalizedPageRank(nodeIds, edges, []);
  db.exec("DELETE FROM pagerank");
  const ins = db.prepare("INSERT INTO pagerank(node_id, score) VALUES (?, ?)");
  for (const n of nodes) {
    ins.run(n.id, scores.get(n.id) ?? 0);
  }
}

/** @internal exported for tests */
export async function embedSymbol(
  embedder: Embedder,
  lang: string,
  kind: string,
  name: string,
  signature: string | null | undefined,
): Promise<{ contentHash: string; vec: Float32Array }> {
  const embedText = defaultEmbedText(kind, name, signature);
  const contentHash = contentHashFor({ lang, kind, name, signature, embedText });
  const vec = await embedder.embed(embedText);
  return { contentHash, vec };
}
