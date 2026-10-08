import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  openDb,
  openCurrentDb,
  isCurrentIndex,
  clearNeedsReindex,
  needsReindex,
  postPending,
  setPostPending,
  clearPostPending,
  FILE_NODE_KIND,
} from "./db.js";
import { langForPath, type LangConfig } from "./languages.js";
import { extract, importSpecifier } from "./extract.js";
import { getEmbedder, toBlob } from "./embedder.js";
import { contentHashFor, defaultEmbedText } from "./embed-input.js";
import { buildDirHashMap, dirHash, HASH_EMPTY } from "./merkle.js";
import {
  loadAffectedConfig,
  isTestPath,
  inferModule,
  type AffectedConfig,
} from "./affected-config.js";
import { realPathOf } from "../../shared/paths.js";
import { writeIndexStats } from "../../shared/index-stats.js";
import { personalizedPageRank, edgeWeightMul, type PrEdge } from "./pagerank.js";
import type { DatabaseSync, StatementSync } from "node:sqlite";
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

/** Why a path is not part of the index file set (see {@link classifyIndexPath}). */
export type IneligibleReason = "outside" | "ignored" | "language" | "size" | "missing";

/** Result of {@link classifyIndexPath}: the repo-relative path, or why it is excluded. */
export type IndexPathClass =
  | { eligible: true; rel: string; lang: LangConfig; size: number; mtimeMs: number }
  | { eligible: false; rel: string | null; reason: IneligibleReason };

/**
 * Whether a directory or file name inside the project is walked by a full index.
 * The single source of the skip rule shared by the walk and per-file reindex.
 */
function isSkippedDir(name: string): boolean {
  return SKIP_DIRS.has(name);
}

/**
 * `p` with symlinks resolved and, where the platform reports it (macOS,
 * Windows), each existing segment spelled as stored on disk. A missing tail
 * keeps its given spelling. Falls back to {@link realPathOf} when the native
 * resolver fails.
 *
 * @param p - An absolute path.
 */
function canonicalPathOf(p: string): string {
  const tail: string[] = [];
  let cur = path.resolve(p);
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(cur), ...tail.reverse());
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") return realPathOf(p);
      const parent = path.dirname(cur);
      if (parent === cur) return realPathOf(p);
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

/**
 * Classify one path against the full walk's file-set rules, so a per-file
 * reindex and a full index agree on which files are indexed (and the directory
 * Merkle tree stays the hash of the same file set).
 *
 * A path is eligible when it lies inside `projectPath` (symlinks in its existing
 * prefix resolved, and its spelling taken from the filesystem where the platform
 * reports it, so a case variant on a case-insensitive volume yields the stored
 * spelling), no directory segment is a skipped directory, its extension
 * maps to an indexed language, it is a regular file, and it does not exceed the
 * walk's size cap. A path that does not exist yields `missing` with its
 * repo-relative form, so the caller can drop a deleted file's rows.
 *
 * @param projectPath - Absolute project root.
 * @param absPath - Absolute path to classify.
 */
export function classifyIndexPath(projectPath: string, absPath: string): IndexPathClass {
  const relNative = path.relative(canonicalPathOf(projectPath), canonicalPathOf(absPath));
  if (!relNative || relNative.startsWith("..") || path.isAbsolute(relNative)) {
    return { eligible: false, rel: null, reason: "outside" };
  }
  const rel = relNative.split(path.sep).join("/");
  const parts = rel.split("/");
  if (parts.slice(0, -1).some(isSkippedDir)) return { eligible: false, rel, reason: "ignored" };
  const lang = langForPath(rel);
  if (!lang) return { eligible: false, rel, reason: "language" };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(path.join(projectPath, rel));
  } catch {
    return { eligible: false, rel, reason: "missing" };
  }
  if (!stat.isFile()) return { eligible: false, rel, reason: "ignored" };
  if (stat.size > MAX_FILE_BYTES) return { eligible: false, rel, reason: "size" };
  return { eligible: true, rel, lang, size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) };
}

/**
 * Whether a full walk of `projectPath` would yield exactly `rel`: every segment
 * is listed by its parent directory with exactly that spelling (a case-sensitive
 * compare, so a case-only rename on a case-insensitive volume does not match),
 * every directory segment is a real, non-skipped directory and the leaf a
 * regular file (no segment is a symlink, as the walk never follows one), and
 * {@link classifyIndexPath} finds it eligible under the same `rel`.
 *
 * A full run keeps a stored row its walk did not see only when this holds;
 * any other row would duplicate the file's symbols under a second path.
 *
 * @param projectPath - Absolute project root (as walked).
 * @param rel - Repo-relative path with `/` separators.
 * @param listings - Optional cache of directory listings, keyed by absolute
 *   directory, shared across calls in one run.
 */
export function walkWouldYield(
  projectPath: string,
  rel: string,
  listings: Map<string, Set<string> | null> = new Map(),
): boolean {
  const parts = rel.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
  let dir = projectPath;
  for (let i = 0; i < parts.length; i++) {
    const name = parts[i]!;
    let names = listings.get(dir);
    if (names === undefined) {
      try {
        names = new Set(fs.readdirSync(dir));
      } catch {
        names = null;
      }
      listings.set(dir, names);
    }
    if (!names?.has(name)) return false;
    const full = path.join(dir, name);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(full);
    } catch {
      return false;
    }
    const leaf = i === parts.length - 1;
    if (leaf ? !stat.isFile() : !stat.isDirectory() || isSkippedDir(name)) return false;
    dir = full;
  }
  const c = classifyIndexPath(projectPath, path.join(projectPath, rel));
  return c.eligible && c.rel === rel;
}

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
  /**
   * Test seams, not part of the public contract: `onOpen` receives the
   * connection right after it opens; `afterWalk` runs after the file walk and
   * before the write lock is taken (awaited).
   */
  hooks?: {
    onOpen?: (db: DatabaseSync) => void;
    afterWalk?: () => void | Promise<void>;
  };
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
 * Resolve call, import, and type-reference (`ref`) edges to node ids — the one
 * place edge resolution lives, shared by the full index run and incremental
 * re-indexing.
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
 * - A `ref` resolves only to the definition its same-file import binding's
 *   target file holds (barrel subtree as for calls), else to a same-file
 *   definition; never by a bare global name (`ref` edges are not counted in
 *   the returned stats).
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

  // Covers: req~type-ref-edges~1
  // A type reference resolves only through its own file: the definition its
  // import binding's target file (or that barrel's subtree) holds, else a
  // same-file definition. Never by a bare global name, so a generic `Props`
  // in an unrelated file stays NULL. `is_member = 1` (`a.b.Type`, a
  // non-import qualifier) never resolves.
  db.prepare(
    `UPDATE edges SET dst_node_id = (
       SELECT n.id FROM nodes n
       WHERE n.name = edges.dst_name
         AND n.kind <> '${FILE_NODE_KIND}'
         AND ((edges.spec IS NOT NULL AND (n.file_id = ${importTarget} OR ${underTargetDir}))
              OR (edges.is_member = 0 AND n.file_id = edges.src_file_id))
       ORDER BY CASE WHEN n.file_id = ${importTarget} THEN 0
                     WHEN edges.spec IS NOT NULL AND ${underTargetDir} THEN 1
                     ELSE 2 END, n.id
       LIMIT 1
     )
     WHERE kind = 'ref' AND dst_node_id IS NULL AND is_member <> 1
       ${callScope}`,
  ).run(...(narrow ? [...ids, ...importScope, ...ids] : []));
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
        if (!isSkippedDir(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        if (langForPath(full)) yield full;
      }
    }
  }
}

/** Counters a fragment write adds to (a subset of {@link IndexStats}). */
type FragmentStats = Pick<
  IndexStats,
  "files" | "nodes" | "edges" | "embeddings" | "computed" | "fromCache"
>;

/**
 * Prepared statements for writing one file's fragment (its `files` row, nodes,
 * edges, full-text rows, metrics, coverage links, and cached embeddings),
 * shared by the full walk and the per-file reindex so both write identical rows.
 */
interface FileWriter {
  db: DatabaseSync;
  /** Refresh `last_seen_at` on cache hits (full runs only: a per-file run never touches the cache). */
  touch: boolean;
  /**
   * Collect the files whose edges a detach resets (per-file runs only: they
   * scope resolution to them; a full run resolves every edge anyway).
   */
  collectOwners: boolean;
  embedder: Embedder;
  cfg: AffectedConfig;
  insFile: StatementSync;
  updFile: StatementSync;
  detach: StatementSync;
  detachedOwners: StatementSync;
  delNodes: StatementSync;
  delEdges: StatementSync;
  delCoverage: StatementSync;
  delFile: StatementSync;
  insNode: StatementSync;
  insMetrics: StatementSync;
  insEdge: StatementSync;
  insCoverage: StatementSync;
  insCache: StatementSync;
  hasCache: StatementSync;
  touchCache: StatementSync;
  insNodeText: StatementSync;
}

function prepareFileWriter(
  db: DatabaseSync,
  embedder: Embedder,
  cfg: AffectedConfig,
  touch = true,
): FileWriter {
  return {
    db,
    touch,
    collectOwners: !touch,
    embedder,
    cfg,
    insFile: db.prepare(
      "INSERT INTO files(path, hash, lang, is_test, module, mtime_ms, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ),
    updFile: db.prepare(
      "UPDATE files SET hash = ?, lang = ?, is_test = ?, module = ?, mtime_ms = ?, size = ? WHERE id = ?",
    ),
    detach: db.prepare(
      "UPDATE edges SET dst_node_id = NULL WHERE dst_node_id IN (SELECT id FROM nodes WHERE file_id = ?)",
    ),
    detachedOwners: db.prepare(
      `SELECT DISTINCT src_file_id AS id FROM edges
       WHERE src_file_id <> ? AND dst_node_id IN (SELECT id FROM nodes WHERE file_id = ?)`,
    ),
    delNodes: db.prepare("DELETE FROM nodes WHERE file_id = ?"),
    delEdges: db.prepare("DELETE FROM edges WHERE src_file_id = ?"),
    delCoverage: db.prepare("DELETE FROM coverage_links WHERE file_path = ?"),
    delFile: db.prepare("DELETE FROM files WHERE id = ?"),
    insNode: db.prepare(
      `INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte, parent_id, signature, body_hash, norm_hash, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insMetrics: db.prepare(
      `INSERT INTO node_metrics(node_id, loc, max_nesting, branches) VALUES (?, ?, ?, ?)`,
    ),
    insEdge: db.prepare(
      `INSERT INTO edges(src_node_id, src_file_id, dst_name, kind, line, is_member, spec) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    insCoverage: db.prepare(
      `INSERT OR REPLACE INTO coverage_links(
         artifact_type, name, revision, kind, file_path, line, node_id, source_type, origin
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insCache: db.prepare(
      `INSERT INTO embedding_cache(content_hash, model, dim, vec, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(content_hash, model) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    ),
    hasCache: db.prepare(
      `SELECT 1 AS ok FROM embedding_cache WHERE content_hash = ? AND model = ?`,
    ),
    touchCache: db.prepare(
      `UPDATE embedding_cache SET last_seen_at = ? WHERE content_hash = ? AND model = ?`,
    ),
    insNodeText: db.prepare(
      `INSERT INTO node_text(node_id, name, subtokens, signature, doc) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET
         name = excluded.name,
         subtokens = excluded.subtokens,
         signature = excluded.signature,
         doc = excluded.doc`,
    ),
  };
}

/**
 * Reset every edge whose destination is one of a file's nodes, before those
 * nodes are deleted. Without this, a rowid freed by the delete and reused by a
 * node inserted later in the same run would silently re-point another file's
 * edge at an unrelated symbol; a post-hoc "id not in nodes" check cannot see
 * that. The run's resolution pass then re-binds the edges by their rules.
 *
 * @returns The ids of the other files whose edges were reset (empty on a full run, which does not need them).
 */
function detachFileNodes(w: FileWriter, fileId: number): number[] {
  // Covers: req~edge-ids-survive-reindex~1
  const owners = w.collectOwners
    ? (w.detachedOwners.all(fileId, fileId) as Array<{ id: number }>).map((r) => r.id)
    : [];
  w.detach.run(fileId);
  return owners;
}

/**
 * Drop a removed file: detach edges into it, delete its coverage links (the
 * file-level ones have no node to cascade from), then delete its row (nodes and
 * edges cascade).
 */
function removeFileRows(w: FileWriter, fileId: number, rel: string): number[] {
  const owners = detachFileNodes(w, fileId);
  w.delCoverage.run(rel);
  w.delFile.run(fileId);
  return owners;
}

/** Input for {@link writeFileFragment}. */
interface FragmentInput {
  rel: string;
  lang: LangConfig;
  content: string;
  hash: string;
  mtimeMs: number;
  size: number;
  /** Existing `files.id` to replace, or null for a new file. */
  priorId: number | null;
  stats: FragmentStats;
}

/**
 * (Re-)extract one file and write its whole fragment: upsert its `files` row,
 * replace its nodes, file-owner node, edges, `node_text`/FTS rows, metrics, and
 * coverage links, and embed cache misses through `embedding_cache`. Edges are
 * written unresolved; the caller runs {@link resolveEdges}.
 *
 * @returns The file id and the ids of other files whose edges were detached.
 */
async function writeFileFragment(
  w: FileWriter,
  f: FragmentInput,
): Promise<{ fileId: number; detachedOwners: number[] }> {
  const { rel, lang, content, stats } = f;
  let fileId: number;
  let detachedOwners: number[] = [];
  const isTest = isTestPath(rel, w.cfg.testGlobs) ? 1 : 0;
  const mod = inferModule(rel);
  if (f.priorId !== null) {
    w.updFile.run(f.hash, lang.id, isTest, mod, f.mtimeMs, f.size, f.priorId);
    // Covers: req~edge-ids-survive-reindex~1
    detachedOwners = detachFileNodes(w, f.priorId);
    w.delNodes.run(f.priorId);
    w.delEdges.run(f.priorId);
    w.delCoverage.run(rel);
    fileId = f.priorId;
  } else {
    fileId = Number(
      w.insFile.run(rel, f.hash, lang.id, isTest, mod, f.mtimeMs, f.size).lastInsertRowid,
    );
  }

  const { symbols, refs, coverage, reexports } = await extract(content, lang);
  const nodeIds: number[] = [];
  const now = Date.now();
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
      w.insNode.run(
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
    w.insMetrics.run(id, s.loc, s.maxNesting, s.branches);
    w.insNodeText.run(id, s.name, s.subtokens, s.signature ?? "", s.docstring);

    const hit = w.hasCache.get(ch, w.embedder.id) as { ok: number } | undefined;
    if (hit) {
      if (w.touch) w.touchCache.run(now, ch, w.embedder.id);
      stats.fromCache++;
    } else {
      const vec = await w.embedder.embed(embedText);
      w.insCache.run(ch, w.embedder.id, w.embedder.dim, toBlob(vec), now, now);
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
      w.insNode.run(
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
    w.insEdge.run(srcId, fileId, r.name, r.kind, r.line, r.member, r.spec);
    stats.edges++;
  }
  const sourceType = inferSourceType(rel);
  for (const c of coverage) {
    const nodeId = c.ownerIndex !== null ? nodeIds[c.ownerIndex]! : null;
    w.insCoverage.run(
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
  return { fileId, detachedOwners };
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
  opts.hooks?.onOpen?.(db);
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
  const seen = new Set<string>();
  const fileHashes = new Map<string, string>();
  const w = prepareFileWriter(db, embedder, cfg);

  const allFiles = [...walkFiles(projectPath)];
  // Set inside the transaction; read after it to decide whether the map is written.
  let noop: boolean | undefined;
  try {
    await opts.hooks?.afterWalk?.();
    // Take the write lock before reading the stored file set: a per-file
    // reindex committing a new file's row between that read and this run's
    // insert would otherwise fail the whole run on the unique path. Per-file
    // runs wait for (or give up on) this lock instead. Inside the try so a
    // SQLITE_BUSY here still closes the connection.
    db.exec("BEGIN IMMEDIATE");
    const force = Boolean(opts.force) || needsReindex(db);
    const existing = new Map<
      string,
      { id: number; hash: string; mtime_ms: number | null; size: number | null }
    >();
    for (const row of db
      .prepare("SELECT id, path, hash, mtime_ms, size FROM files")
      .all() as Array<{
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

    // Stat, hash, and (when changed) re-extract one walked file.
    const visit = async (filePath: string, rel: string): Promise<void> => {
      seen.add(rel);
      const lang = langForPath(filePath)!;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_BYTES) return;
      } catch {
        return;
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
        return;
      }

      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        return;
      }
      const hash = hashOf(content);
      fileHashes.set(rel, hash);

      if (!force && prior && prior.hash === hash) {
        w.updFile.run(
          hash,
          lang.id,
          isTestPath(rel, cfg.testGlobs) ? 1 : 0,
          inferModule(rel),
          mtimeMs,
          size,
          prior.id,
        );
        stats.unchanged++;
        return;
      }

      await writeFileFragment(w, {
        rel,
        lang,
        content,
        hash,
        mtimeMs,
        size,
        priorId: prior?.id ?? null,
        stats,
      });
    };

    let done = 0;
    for (const filePath of allFiles) {
      const rel = path.relative(projectPath, filePath).split(path.sep).join("/");
      done++;
      if (onProgress) onProgress({ file: rel, done, total: allFiles.length });
      await visit(filePath, rel);
    }

    const listings = new Map<string, Set<string> | null>();
    for (const [rel, row] of existing) {
      if (!seen.has(rel)) {
        // The walk ran before the lock: a per-file reindex may have committed
        // a row for a file created after the walk passed its directory. Keep
        // and index a row only when the walk would now yield that exact path;
        // drop the rest (deleted, ineligible, renamed by case only, or reached
        // only through a symlink) so no file is held under two paths.
        const abs = path.join(projectPath, rel);
        if (!walkWouldYield(projectPath, rel, listings)) {
          // Covers: req~edge-ids-survive-reindex~1
          removeFileRows(w, row.id, rel);
          stats.removed++;
          continue;
        }
        await visit(abs, rel);
      }
      if (!fileHashes.has(rel)) fileHashes.set(rel, row.hash);
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
    // A per-file reindex already moved the stored hashes to match the tree but
    // deferred PageRank and the map to here: its marker disables the fast path.
    noop =
      stats.rootUnchanged &&
      !prune &&
      opts.maxCacheMB === undefined &&
      stats.removed === 0 &&
      !postPending(db);

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
      clearPostPending(db);

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
    writeIndexStats(projectPath, stats.totals);
  } catch (err) {
    // SQLite may already have rolled back (or BEGIN never succeeded): an
    // unguarded ROLLBACK would throw and mask the original error.
    if (db.isTransaction) db.exec("ROLLBACK");
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

/** Outcome of {@link indexFiles}, per path (repo-relative where known). */
export interface IndexFilesResult {
  /** Re-extracted files. */
  reindexed: string[];
  /** Deleted files whose rows were dropped. */
  removed: string[];
  /** Files whose content hash matched the stored one: no node or edge written. */
  unchanged: string[];
  /** Paths outside the index file set, or missing with no stored row. */
  skipped: Array<{ path: string; reason: IneligibleReason }>;
  /** The index is missing or needs a full run (stale schema): nothing was done. */
  stale: boolean;
}

/**
 * Re-index exactly the given files in an existing, current index — the
 * per-edit path behind `speclaw reindex-file`.
 *
 * Inside one `BEGIN IMMEDIATE` transaction (so each file is read after the
 * write lock is held, and the last run to begin saw the last edit), each path
 * is classified with the full walk's rules ({@link classifyIndexPath}): a
 * changed file is re-extracted with the same fragment writer as
 * {@link buildIndex}, a deleted file's rows are dropped, an unchanged file only
 * refreshes its stat columns, and anything else is skipped. Edges are then
 * resolved by {@link resolveEdges} scoped to the re-indexed files plus the files
 * whose edges were detached from them (that scope also re-tries NULL edges that
 * name a symbol the re-indexed files now define), and the directory hashes of
 * the touched files' ancestors are recomputed.
 *
 * Global post-processing is deferred: no PageRank recomputation (the old rows of
 * replaced nodes drop by cascade; new symbols have none until the next full
 * run), no embedding-cache touch or eviction, no `docs/compass.md` write, no
 * `meta.indexed_at` change, and no Compass call log entry. When it writes any
 * row it sets `meta.post_pending`, which makes the next full run skip its no-op
 * fast path and do that work.
 *
 * Caveat inherited from scoped resolution: an edge already bound to a node
 * elsewhere is never re-ranked, so when an edit adds a better candidate for an
 * ambiguous name the old binding stays until the next full run that re-extracts
 * the calling file.
 *
 * Never creates, migrates, or wipes the database: a missing index or one that
 * needs a full reindex returns `stale: true` with nothing written.
 *
 * @param projectPath - Absolute project root.
 * @param paths - File paths, absolute or relative to `projectPath`.
 * @throws When the database stays locked past the busy timeout (`SQLITE_BUSY`) or a write fails; the transaction is rolled back.
 */
export async function indexFiles(projectPath: string, paths: string[]): Promise<IndexFilesResult> {
  // Covers: req~reindex-on-edit~1
  const result: IndexFilesResult = {
    reindexed: [],
    removed: [],
    unchanged: [],
    skipped: [],
    stale: false,
  };
  const db = openCurrentDb(projectPath);
  if (!db) {
    result.stale = true;
    return result;
  }
  try {
    const embedder = getEmbedder();
    const w = prepareFileWriter(db, embedder, loadAffectedConfig(projectPath), false);
    const getFile = db.prepare("SELECT id, hash FROM files WHERE path = ?");
    const stats: FragmentStats = {
      files: 0,
      nodes: 0,
      edges: 0,
      embeddings: 0,
      computed: 0,
      fromCache: 0,
    };
    const scope = new Set<number>();
    const changed: string[] = [];
    const targets = [...new Set(paths.map((p) => path.resolve(projectPath, p)))];

    db.exec("BEGIN IMMEDIATE");
    try {
      // The probe ran before the lock: a full run (or another version) may
      // have migrated, wiped, or flagged the index since. Re-check under the
      // lock and leave it to the next full run if so.
      if (!isCurrentIndex(db)) {
        db.exec("ROLLBACK");
        result.stale = true;
        return result;
      }
      for (const abs of targets) {
        let c = classifyIndexPath(projectPath, abs);
        // Register only the path a full walk would yield (exact spelling, no
        // symlink segment); a full run would otherwise drop the row again.
        if (c.eligible && !walkWouldYield(projectPath, c.rel)) {
          c = { eligible: false, rel: c.rel, reason: "ignored" };
        }
        if (!c.eligible) {
          const row =
            c.reason === "missing" && c.rel !== null
              ? (getFile.get(c.rel) as { id: number } | undefined)
              : undefined;
          if (row && c.rel !== null) {
            // Covers: req~edge-ids-survive-reindex~1
            for (const id of removeFileRows(w, row.id, c.rel)) scope.add(id);
            result.removed.push(c.rel);
            changed.push(c.rel);
          } else {
            result.skipped.push({ path: c.rel ?? abs, reason: c.reason });
          }
          continue;
        }
        let content: string;
        try {
          content = fs.readFileSync(path.join(projectPath, c.rel), "utf8");
        } catch {
          result.skipped.push({ path: c.rel, reason: "missing" });
          continue;
        }
        const hash = hashOf(content);
        const prior = getFile.get(c.rel) as { id: number; hash: string } | undefined;
        if (prior && prior.hash === hash) {
          w.updFile.run(
            hash,
            c.lang.id,
            isTestPath(c.rel, w.cfg.testGlobs) ? 1 : 0,
            inferModule(c.rel),
            c.mtimeMs,
            c.size,
            prior.id,
          );
          result.unchanged.push(c.rel);
          continue;
        }
        const written = await writeFileFragment(w, {
          rel: c.rel,
          lang: c.lang,
          content,
          hash,
          mtimeMs: c.mtimeMs,
          size: c.size,
          priorId: prior?.id ?? null,
          stats,
        });
        scope.add(written.fileId);
        for (const id of written.detachedOwners) scope.add(id);
        result.reindexed.push(c.rel);
        changed.push(c.rel);
      }

      if (changed.length > 0) {
        resolveEdges(db, [...scope]);
        updateAncestorDirHashes(db, changed);
        setPostPending(db);
      }
      db.exec("COMMIT");
    } catch (err) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db.close();
  }
  return result;
}

/**
 * Recompute the `dir_hashes` rows of every ancestor directory of the given
 * files (deepest first, root last) from the stored `files.hash` values and the
 * child directory rows, with the same hash rule and `n_files` count as the full
 * walk ({@link buildDirHashMap}). A directory left with no indexed file loses
 * its row; the root row always exists.
 */
function updateAncestorDirHashes(db: DatabaseSync, rels: string[]): void {
  const dirs = new Set<string>([""]);
  for (const rel of rels) {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const depth = (d: string): number => (d === "" ? 0 : d.split("/").length);
  const ordered = [...dirs].sort((a, b) => depth(b) - depth(a));
  const all = db.prepare("SELECT path, hash FROM files");
  // '/' + 1 is '0': [dir/, dir0) is every path under dir/ in byte order.
  const under = db.prepare("SELECT path, hash FROM files WHERE path >= ? AND path < ?");
  const dirRow = db.prepare("SELECT hash FROM dir_hashes WHERE path = ?");
  const upsert = db.prepare(
    `INSERT INTO dir_hashes(path, hash, n_files, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, n_files = excluded.n_files,
       updated_at = excluded.updated_at`,
  );
  const del = db.prepare("DELETE FROM dir_hashes WHERE path = ?");
  const now = Date.now();
  for (const dir of ordered) {
    const prefix = dir === "" ? "" : `${dir}/`;
    const rows = (dir === "" ? all.all() : under.all(prefix, `${dir}0`)) as Array<{
      path: string;
      hash: string;
    }>;
    if (rows.length === 0 && dir !== "") {
      del.run(dir);
      continue;
    }
    const children = new Map<string, string>();
    for (const r of rows) {
      const rest = r.path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) {
        children.set(rest, r.hash);
      } else {
        const name = rest.slice(0, slash);
        if (!children.has(name)) {
          const sub = dirRow.get(prefix + name) as { hash: string } | undefined;
          children.set(name, sub?.hash ?? HASH_EMPTY);
        }
      }
    }
    const hash = dirHash([...children].map(([name, h]) => ({ name, hash: h })));
    upsert.run(dir, hash, rows.length, now);
  }
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
