import fs from "node:fs";
import path from "node:path";
import { openDb, indexExists } from "./db.js";
import { getEmbedder, fromBlob, cosine } from "./embedder.js";
import { loadAffectedConfig, filterFilesForTarget, matchGlobalFiles } from "./affected-config.js";

/** A single node matched by a structural or semantic search. */
export interface SearchHit {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature: string | null;
}

/** Result of exploring a node: its source plus its callees and callers. */
export interface ExploreResult {
  found: boolean;
  symbol?: {
    name: string;
    kind: string;
    file: string;
    startLine: number;
    endLine: number;
    signature: string | null;
    source: string;
  };
  callees?: Array<{ name: string; file?: string; line: number }>;
  callers?: Array<{ name: string; kind: string; file: string; line: number }>;
  otherMatches?: SearchHit[];
  message?: string;
}

function requireIndex(projectPath: string): void {
  if (!indexExists(projectPath)) {
    throw new Error(
      "No index found. Build it first with the index_build tool (creates .speclaw/index.db).",
    );
  }
}

/**
 * Structural search: find nodes whose name contains `query` (substring match),
 * ranking exact matches and shorter names first.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param query - Name or keyword to match as a substring.
 * @param limit - Maximum number of hits to return.
 * @returns Matching nodes ordered by relevance.
 * @throws If no index exists for the project.
 */
export function search(projectPath: string, query: string, limit = 25): SearchHit[] {
  requireIndex(projectPath);
  const db = openDb(projectPath);
  try {
    const rows = db
      .prepare(
        `SELECT s.name, s.kind, f.path AS file, s.start_line AS line, s.signature
         FROM nodes s JOIN files f ON f.id = s.file_id
         WHERE s.name LIKE ?
         ORDER BY (s.name = ?) DESC, length(s.name) ASC
         LIMIT ?`,
      )
      .all(`%${query}%`, query, limit) as unknown as SearchHit[];
    return rows;
  } finally {
    db.close();
  }
}

function readSource(projectPath: string, file: string, startByte: number, endByte: number): string {
  try {
    const buf = fs.readFileSync(path.join(projectPath, file));
    return buf.subarray(startByte, endByte).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Explore an exact node by name: return its verbatim source, callees, and
 * callers (its blast radius).
 *
 * When several nodes share the name, functions and classes are preferred as the
 * primary result and the rest are surfaced under `otherMatches`. When no exact
 * match exists, falls back to a fuzzy {@link search} so the caller still gets
 * useful candidates.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param query - Exact node name to explore.
 * @returns The explore result; `found` is `false` when no exact match exists.
 * @throws If no index exists for the project.
 */
export function explore(projectPath: string, query: string): ExploreResult {
  requireIndex(projectPath);
  const db = openDb(projectPath);
  try {
    const matches = db
      .prepare(
        `SELECT s.id, s.name, s.kind, s.start_line, s.end_line, s.start_byte, s.end_byte,
                s.signature, f.path AS file
         FROM nodes s JOIN files f ON f.id = s.file_id
         WHERE s.name = ?
         ORDER BY s.kind = 'function' DESC, s.kind = 'class' DESC
         LIMIT 10`,
      )
      .all(query) as Array<{
      id: number;
      name: string;
      kind: string;
      start_line: number;
      end_line: number;
      start_byte: number;
      end_byte: number;
      signature: string | null;
      file: string;
    }>;

    if (matches.length === 0) {
      // fall back to fuzzy search so the caller gets something useful
      const near = search(projectPath, query, 10);
      return {
        found: false,
        message: `No exact symbol named "${query}". ${near.length} similar symbol(s) below.`,
        otherMatches: near,
      };
    }

    const best = matches[0]!;
    const callees = db
      .prepare(
        `SELECT e.dst_name AS name, e.line, f.path AS file
         FROM edges e LEFT JOIN nodes s ON s.id = e.dst_node_id
         LEFT JOIN files f ON f.id = s.file_id
         WHERE e.src_node_id = ? AND e.kind = 'call'
         ORDER BY e.line`,
      )
      .all(best.id) as Array<{ name: string; line: number; file: string | null }>;

    // Callers: match both the resolved edge AND any call by this name, so
    // dynamic dispatch (a method/function called by name across sites) is not
    // missed. Over-approximates conservatively — the point of a blast radius.
    const callers = db
      .prepare(
        `SELECT DISTINCT owner.name AS name, owner.kind AS kind, f.path AS file, e.line
         FROM edges e
         JOIN nodes owner ON owner.id = e.src_node_id
         JOIN files f ON f.id = owner.file_id
         WHERE (e.dst_node_id = ? OR e.dst_name = ?) AND e.kind = 'call'
         ORDER BY f.path, e.line`,
      )
      .all(best.id, best.name) as Array<{ name: string; kind: string; file: string; line: number }>;

    return {
      found: true,
      symbol: {
        name: best.name,
        kind: best.kind,
        file: best.file,
        startLine: best.start_line,
        endLine: best.end_line,
        signature: best.signature,
        source: readSource(projectPath, best.file, best.start_byte, best.end_byte),
      },
      callees: callees.map((c) => ({ name: c.name, file: c.file ?? undefined, line: c.line })),
      callers,
      otherMatches:
        matches.length > 1
          ? matches.slice(1).map((m) => ({
              name: m.name,
              kind: m.kind,
              file: m.file,
              line: m.start_line,
              signature: m.signature,
            }))
          : undefined,
    };
  } finally {
    db.close();
  }
}

/** A {@link SearchHit} annotated with its semantic similarity `score`. */
export interface RecallHit extends SearchHit {
  score: number;
}

/**
 * Semantic search: embed the natural-language query and rank nodes by cosine
 * similarity against the local vector store. Finds code by meaning, not just
 * by matching identifier substrings.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param query - Natural-language description of the code being sought.
 * @param limit - Maximum number of hits to return.
 * @returns Nodes sorted by descending similarity score.
 * @throws If no index exists for the project.
 */
export async function recall(projectPath: string, query: string, limit = 15): Promise<RecallHit[]> {
  requireIndex(projectPath);
  const embedder = getEmbedder();
  const qvec = await embedder.embed(query);
  const db = openDb(projectPath);
  try {
    const rows = db
      .prepare(
        `SELECT n.name, n.kind, f.path AS file, n.start_line AS line, n.signature, e.vec
         FROM node_embeddings e
         JOIN nodes n ON n.id = e.node_id
         JOIN files f ON f.id = n.file_id
         WHERE e.dim = ?`,
      )
      .all(embedder.dim) as Array<{
      name: string;
      kind: string;
      file: string;
      line: number;
      signature: string | null;
      vec: Uint8Array;
    }>;

    const scored = rows.map((r) => ({
      name: r.name,
      kind: r.kind,
      file: r.file,
      line: r.line,
      signature: r.signature,
      score: cosine(qvec, fromBlob(r.vec)),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  } finally {
    db.close();
  }
}

/** A node in the impact set, tagged with hop depth and resolution quality. */
export interface ImpactNode {
  nodeId: number;
  name: string;
  kind: string;
  file: string;
  line: number;
  depth: number;
  /** `exact` = every hop used `dst_node_id`; `by-name` used at least one name fallback. */
  resolution: "exact" | "by-name";
  module: string;
}

/** Per-module summary for grouped blast-radius output. */
export interface ImpactModule {
  module: string;
  nodes: number;
  files: number;
  minDepth: number;
  byName: number;
  top: ImpactNode[];
}

/** Inputs for {@link impact}. */
export interface ImpactQuery {
  symbol?: string;
  nodeId?: number;
  files?: string[];
  maxDepth?: number;
  edgeKinds?: Array<"call" | "import">;
  target?: "build" | "test" | "lint" | "any";
  hardLimit?: number;
  topModules?: number;
  topPerModule?: number;
  format?: "grouped" | "flat";
}

/** Structured blast-radius result (grouped by default). */
export interface ImpactResult {
  target:
    | {
        kind: "symbol";
        symbol: string;
        definitions: Array<{ nodeId: number; file: string; line: number }>;
      }
    | { kind: "files"; files: string[] };
  totals: { nodes: number; files: number; modules: number };
  global?: { matched: string[]; blastRadius: "repo"; reason: string };
  modules: ImpactModule[];
  /** Present when `format` is `flat`. */
  nodes?: ImpactNode[];
  resolution: { exact: number; byName: number };
  limits: { maxDepth: number; maxDepthReached: boolean; truncated: boolean };
  warnings: string[];
}

const DEFAULT_HARD_LIMIT = 500;

/**
 * Reverse dependency closure (blast radius) for a symbol or set of files.
 *
 * Uses one recursive SQL CTE that prefers `edges.dst_node_id` and falls back to
 * `dst_name` only when the id is NULL. Default edge kinds are `call` and
 * `import`. Results are grouped by module unless `format: "flat"`.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param symbolOrOpts - Symbol name (legacy) or full {@link ImpactQuery}.
 * @param maxDepth - Used only with the legacy string form.
 */
export function impact(
  projectPath: string,
  symbolOrOpts: string | ImpactQuery,
  maxDepth = 4,
): ImpactResult {
  const opts: ImpactQuery =
    typeof symbolOrOpts === "string"
      ? { symbol: symbolOrOpts, maxDepth }
      : { maxDepth: 4, ...symbolOrOpts };

  requireIndex(projectPath);
  const cfg = loadAffectedConfig(projectPath);
  const depth = Math.max(1, Math.min(12, opts.maxDepth ?? 4));
  const edgeKinds = opts.edgeKinds?.length ? opts.edgeKinds : (["call", "import"] as const);
  const hardLimit = opts.hardLimit ?? DEFAULT_HARD_LIMIT;
  const topModules = opts.topModules ?? 8;
  const topPerModule = opts.topPerModule ?? 5;
  const format = opts.format ?? "grouped";
  const target = opts.target ?? "any";
  const warnings: string[] = [];

  const db = openDb(projectPath);
  try {
    let seedFiles = opts.files ? [...opts.files] : [];
    if (seedFiles.length > 0) {
      const filtered = filterFilesForTarget(seedFiles, target, cfg);
      warnings.push(...filtered.warnings);
      seedFiles = filtered.included;
      const glob = matchGlobalFiles(seedFiles, cfg);
      if (glob.matched.length > 0) {
        return {
          target: { kind: "files", files: seedFiles },
          totals: { nodes: 0, files: 0, modules: 0 },
          global: {
            matched: glob.patterns,
            blastRadius: "repo",
            reason: `Global file(s) matched (${glob.matched.join(", ")}); treat blast radius as the whole repository`,
          },
          modules: [],
          resolution: { exact: 0, byName: 0 },
          limits: { maxDepth: depth, maxDepthReached: false, truncated: false },
          warnings,
        };
      }
    }

    const definitions = resolveImpactSeeds(db, opts, seedFiles, warnings);
    if (definitions.length === 0 && !opts.symbol && seedFiles.length === 0) {
      return emptyImpact(opts, seedFiles, depth, warnings);
    }
    if (definitions.length === 0) {
      warnings.push("No seed definitions found in the index for the given target");
      return emptyImpact(opts, seedFiles, depth, warnings);
    }

    const kindPlaceholders = edgeKinds.map(() => "?").join(",");
    const seedPlaceholders = definitions.map(() => "(?, ?, 0, 0)").join(",");
    const seedArgs: Array<number | string> = [];
    for (const d of definitions) {
      seedArgs.push(d.nodeId, d.name);
    }

    // Sticky by_name: MAX(frontier.by_name, CASE WHEN edge unresolved THEN 1 ELSE 0).
    // Import edges that resolve to ANY node in the frontier node's file count as hits.
    const sql = `
      WITH RECURSIVE
      frontier(node_id, node_name, depth, by_name) AS (
        SELECT * FROM (VALUES ${seedPlaceholders})
        UNION
        SELECT owner.id,
               owner.name,
               f.depth + 1,
               MAX(f.by_name, CASE
                 WHEN e.kind = 'import' THEN 0
                 WHEN e.dst_node_id IS NULL THEN 1
                 ELSE 0
               END)
        FROM frontier f
        JOIN edges e ON (
          e.kind IN (${kindPlaceholders})
          AND (
            (e.kind = 'call' AND (
              e.dst_node_id = f.node_id
              OR (e.dst_node_id IS NULL AND e.dst_name = f.node_name)
            ))
            OR (
              e.kind = 'import'
              AND e.dst_node_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM nodes dn
                WHERE dn.id = e.dst_node_id
                  AND dn.file_id = (SELECT file_id FROM nodes WHERE id = f.node_id)
              )
            )
          )
        )
        JOIN nodes owner ON owner.id = e.src_node_id
        WHERE f.depth < ?
      )
      SELECT r.node_id AS nodeId,
             r.node_name AS name,
             n.kind AS kind,
             fl.path AS file,
             n.start_line AS line,
             MIN(r.depth) AS depth,
             MIN(r.by_name) AS byName,
             fl.module AS module
      FROM frontier r
      JOIN nodes n ON n.id = r.node_id
      JOIN files fl ON fl.id = n.file_id
      WHERE r.depth > 0
      GROUP BY r.node_id
      ORDER BY depth ASC, file ASC, line ASC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(...seedArgs, ...edgeKinds, depth, hardLimit + 1) as Array<{
      nodeId: number;
      name: string;
      kind: string;
      file: string;
      line: number;
      depth: number;
      byName: number;
      module: string;
    }>;

    const truncated = rows.length > hardLimit;
    const sliced = truncated ? rows.slice(0, hardLimit) : rows;
    const nodes: ImpactNode[] = sliced.map((r) => ({
      nodeId: r.nodeId,
      name: r.name,
      kind: r.kind,
      file: r.file,
      line: r.line,
      depth: r.depth,
      resolution: r.byName > 0 ? "by-name" : "exact",
      module: r.module || inferModuleFallback(r.file),
    }));

    const exact = nodes.filter((n) => n.resolution === "exact").length;
    const byName = nodes.length - exact;
    const maxDepthReached = nodes.some((n) => n.depth >= depth);
    const targetDesc =
      opts.symbol || opts.nodeId !== undefined
        ? {
            kind: "symbol" as const,
            symbol: opts.symbol ?? `#${opts.nodeId}`,
            definitions: definitions.map((d) => ({
              nodeId: d.nodeId,
              file: d.file,
              line: d.line,
            })),
          }
        : { kind: "files" as const, files: seedFiles };

    if (format === "flat") {
      const files = new Set(nodes.map((n) => n.file));
      const modules = new Set(nodes.map((n) => n.module));
      return {
        target: targetDesc,
        totals: { nodes: nodes.length, files: files.size, modules: modules.size },
        modules: [],
        nodes,
        resolution: { exact, byName },
        limits: { maxDepth: depth, maxDepthReached, truncated },
        warnings,
      };
    }

    return {
      target: targetDesc,
      totals: {
        nodes: nodes.length,
        files: new Set(nodes.map((n) => n.file)).size,
        modules: new Set(nodes.map((n) => n.module)).size,
      },
      modules: groupImpactModules(nodes, topModules, topPerModule),
      resolution: { exact, byName },
      limits: { maxDepth: depth, maxDepthReached, truncated },
      warnings,
    };
  } finally {
    db.close();
  }
}

function inferModuleFallback(file: string): string {
  const parts = file.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? ".";
  return parts.slice(0, 2).join("/");
}

function emptyImpact(
  opts: ImpactQuery,
  seedFiles: string[],
  depth: number,
  warnings: string[],
): ImpactResult {
  return {
    target:
      opts.symbol || opts.nodeId !== undefined
        ? {
            kind: "symbol",
            symbol: opts.symbol ?? `#${opts.nodeId}`,
            definitions: [],
          }
        : { kind: "files", files: seedFiles },
    totals: { nodes: 0, files: 0, modules: 0 },
    modules: [],
    nodes: opts.format === "flat" ? [] : undefined,
    resolution: { exact: 0, byName: 0 },
    limits: { maxDepth: depth, maxDepthReached: false, truncated: false },
    warnings,
  };
}

function resolveImpactSeeds(
  db: ReturnType<typeof openDb>,
  opts: ImpactQuery,
  seedFiles: string[],
  warnings: string[],
): Array<{ nodeId: number; name: string; file: string; line: number }> {
  if (opts.nodeId !== undefined) {
    const row = db
      .prepare(
        `SELECT n.id AS nodeId, n.name, f.path AS file, n.start_line AS line
         FROM nodes n JOIN files f ON f.id = n.file_id WHERE n.id = ?`,
      )
      .get(opts.nodeId) as { nodeId: number; name: string; file: string; line: number } | undefined;
    return row ? [row] : [];
  }

  if (opts.symbol) {
    const rows = db
      .prepare(
        `SELECT n.id AS nodeId, n.name, f.path AS file, n.start_line AS line
         FROM nodes n JOIN files f ON f.id = n.file_id
         WHERE n.name = ?
         ORDER BY n.kind = 'function' DESC, n.kind = 'class' DESC, n.id ASC
         LIMIT 50`,
      )
      .all(opts.symbol) as Array<{ nodeId: number; name: string; file: string; line: number }>;
    if (rows.length > 1) {
      warnings.push(
        `"${opts.symbol}" is defined in ${rows.length} places; impact is the union. Pass nodeId to disambiguate.`,
      );
    }
    return rows;
  }

  if (seedFiles.length === 0) return [];

  db.exec("CREATE TEMP TABLE IF NOT EXISTS changed(path TEXT PRIMARY KEY)");
  db.exec("DELETE FROM changed");
  const ins = db.prepare("INSERT OR IGNORE INTO changed(path) VALUES (?)");
  for (const f of seedFiles) ins.run(f.split("\\").join("/"));

  const indexed = db
    .prepare(
      `SELECT n.id AS nodeId, n.name, f.path AS file, n.start_line AS line
       FROM nodes n
       JOIN files f ON f.id = n.file_id
       JOIN changed c ON c.path = f.path`,
    )
    .all() as Array<{ nodeId: number; name: string; file: string; line: number }>;

  const indexedPaths = new Set(indexed.map((r) => r.file));
  for (const f of seedFiles) {
    const norm = f.split("\\").join("/");
    if (!indexedPaths.has(norm)) {
      warnings.push(`${norm} is not indexed; run compass_index`);
    }
  }
  return indexed;
}

function groupImpactModules(
  nodes: ImpactNode[],
  topModules: number,
  topPerModule: number,
): ImpactModule[] {
  const byMod = new Map<string, ImpactNode[]>();
  for (const n of nodes) {
    const list = byMod.get(n.module) ?? [];
    list.push(n);
    byMod.set(n.module, list);
  }
  const modules: ImpactModule[] = [];
  for (const [module, list] of byMod) {
    list.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.resolution !== b.resolution) return a.resolution === "exact" ? -1 : 1;
      return a.file.localeCompare(b.file) || a.line - b.line;
    });
    modules.push({
      module,
      nodes: list.length,
      files: new Set(list.map((n) => n.file)).size,
      minDepth: list[0]?.depth ?? 0,
      byName: list.filter((n) => n.resolution === "by-name").length,
      top: list.slice(0, topPerModule),
    });
  }
  modules.sort((a, b) => b.nodes - a.nodes || a.module.localeCompare(b.module));
  return modules.slice(0, topModules);
}

/** Result of a {@link trace}: the call chain from `from` to `to`, if any. */
export interface TraceResult {
  from: string;
  to: string;
  path: string[] | null;
  hops: number;
}

/**
 * Trace a call path from one node to another: BFS forward over call edges (by
 * name) from `from` until `to` is reached, returning the chain of names. null
 * path means no route within maxDepth.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param from - Name of the starting node.
 * @param to - Name of the target node.
 * @param maxDepth - Maximum number of call hops to search.
 * @returns The trace result; `path` is `null` and `hops` is `-1` when no route
 * is found within `maxDepth`.
 * @throws If no index exists for the project.
 */
export function trace(projectPath: string, from: string, to: string, maxDepth = 8): TraceResult {
  requireIndex(projectPath);
  const db = openDb(projectPath);
  try {
    if (from === to) return { from, to, path: [from], hops: 0 };
    const parent = new Map<string, string>();
    const seen = new Set<string>([from]);
    let frontier = [from];
    const calleesStmt = db.prepare(
      `SELECT DISTINCT e.dst_name AS callee
       FROM edges e JOIN nodes src ON src.id = e.src_node_id
       WHERE e.kind = 'call' AND src.name = ?`,
    );
    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const name of frontier) {
        const callees = calleesStmt.all(name) as Array<{ callee: string }>;
        for (const { callee } of callees) {
          if (seen.has(callee)) continue;
          seen.add(callee);
          parent.set(callee, name);
          if (callee === to) {
            const path = [to];
            let cur = to;
            while (parent.has(cur)) {
              cur = parent.get(cur)!;
              path.unshift(cur);
            }
            return { from, to, path, hops: path.length - 1 };
          }
          next.push(callee);
        }
      }
      frontier = next;
    }
    return { from, to, path: null, hops: -1 };
  } finally {
    db.close();
  }
}
