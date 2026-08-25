/**
 * Hybrid retrieval pipeline: BM25 + KNN + name → RRF → ego expand →
 * personalized PageRank → structural rerank → token budget.
 */

import { openDb, indexExists, ftsAvailable } from "./db.js";
import { getEmbedder, fromBlob, cosine } from "./embedder.js";
import { isGitRepo, worktreeChangedFiles } from "../../shared/git.js";
import {
  escapeFtsQuery,
  nameBoost,
  routeWeights,
  rrfFuse,
  structuralScore,
  MAX_DEGREE,
  isSymbolQuery,
} from "./rank.js";
import { personalizedPageRank, edgeWeightMul, type PrEdge } from "./pagerank.js";
import { defaultBudget, fitToBudget, type BudgetHit } from "./budget.js";

/** Per-hit ranking signals for explain / debugging. */
export interface HitSignals {
  bm25Rank?: number;
  knnRank?: number;
  nameRank?: number;
  pagerank: number;
  hops: number;
  score: number;
}

/** One hybrid hit. */
export interface HybridHit {
  nodeId: number;
  name: string;
  kind: string;
  file: string;
  line: number;
  signature: string | null;
  signals: HitSignals;
}

/** Result of {@link hybridSearch}. */
export interface HybridSearchResult {
  rendered: string;
  tokens: number;
  budget: number;
  route: "symbol" | "prose";
  focus: string[];
  hits: HybridHit[];
  degraded: string[];
}

export interface HybridSearchOpts {
  focus?: string[];
  maxTokens?: number;
  /** Override route: exact → symbol weights; concept → prose weights. */
  mode?: "exact" | "concept";
  seedLimit?: number;
}

function requireIndex(projectPath: string): void {
  if (!indexExists(projectPath)) {
    throw new Error(
      "No index found. Build it first with the index_build tool (creates .speclaw/index.db).",
    );
  }
}

/**
 * Resolve focus paths: explicit list, else worktree changes, else empty.
 *
 * @param projectPath - Project root.
 * @param focus - Optional explicit paths.
 */
export function resolveFocus(projectPath: string, focus?: string[]): string[] {
  if (focus && focus.length > 0) return [...new Set(focus)];
  if (!isGitRepo(projectPath)) return [];
  return worktreeChangedFiles(projectPath);
}

/**
 * Hybrid code search over the local Compass index.
 *
 * @param projectPath - Absolute project root.
 * @param query - Identifier or prose.
 * @param opts - Focus, budget, mode.
 */
export async function hybridSearch(
  projectPath: string,
  query: string,
  opts: HybridSearchOpts = {},
): Promise<HybridSearchResult> {
  requireIndex(projectPath);
  const degraded: string[] = [];
  const q = query.trim();
  const focus = resolveFocus(projectPath, opts.focus);
  const focusSet = new Set(focus);
  const mode = opts.mode;
  const route: "symbol" | "prose" =
    mode === "exact"
      ? "symbol"
      : mode === "concept"
        ? "prose"
        : isSymbolQuery(q)
          ? "symbol"
          : "prose";
  const weights = route === "symbol" ? { bm25: 1.0, knn: 0.3, name: 1.0 } : routeWeights(q); // concept / prose
  if (mode === "concept") {
    weights.bm25 = 0.7;
    weights.knn = 1.0;
    weights.name = 0.5;
  }

  const budget = opts.maxTokens ?? defaultBudget(focus.length > 0);
  const seedLimit = opts.seedLimit ?? 50;
  const db = openDb(projectPath);

  try {
    const hasFts = ftsAvailable(db);
    if (!hasFts) degraded.push("fts5-unavailable");

    const bm25Ids: number[] = [];
    const bm25Rank = new Map<number, number>();
    if (hasFts && q) {
      const match = escapeFtsQuery(q);
      if (match) {
        try {
          const rows = db
            .prepare(
              `SELECT f.rowid AS node_id
               FROM nodes_fts f
               WHERE nodes_fts MATCH ?
               ORDER BY bm25(nodes_fts, 10.0, 4.0, 2.0, 1.0) ASC
               LIMIT ?`,
            )
            .all(match, seedLimit) as Array<{ node_id: number }>;
          rows.forEach((r, i) => {
            bm25Ids.push(r.node_id);
            bm25Rank.set(r.node_id, i + 1);
          });
        } catch {
          degraded.push("fts5-query-error");
        }
      }
    }

    const knnIds: number[] = [];
    const knnRank = new Map<number, number>();
    const embedder = getEmbedder();
    const embRows = db
      .prepare(
        `SELECT n.id AS node_id, e.vec
         FROM node_embeddings e
         JOIN nodes n ON n.id = e.node_id
         WHERE e.dim = ?`,
      )
      .all(embedder.dim) as Array<{ node_id: number; vec: Uint8Array }>;
    if (embRows.length === 0) {
      degraded.push("no-embeddings");
    } else if (q) {
      const qvec = await embedder.embed(q);
      const scored = embRows.map((r) => ({
        id: r.node_id,
        score: cosine(qvec, fromBlob(r.vec)),
      }));
      scored.sort((a, b) => b.score - a.score);
      scored.slice(0, seedLimit).forEach((r, i) => {
        knnIds.push(r.id);
        knnRank.set(r.id, i + 1);
      });
    }

    const nameIds: number[] = [];
    const nameRank = new Map<number, number>();
    if (q) {
      const likeRows = db
        .prepare(
          `SELECT n.id
           FROM nodes n
           WHERE n.name LIKE ?
           ORDER BY (n.name = ?) DESC, length(n.name) ASC
           LIMIT 20`,
        )
        .all(`%${q}%`, q) as Array<{ id: number }>;
      likeRows.forEach((r, i) => {
        nameIds.push(r.id);
        nameRank.set(r.id, i + 1);
      });
    }

    const fused = rrfFuse(
      { bm25: bm25Ids, knn: knnIds, name: nameIds },
      { bm25: weights.bm25, knn: weights.knn, name: weights.name },
    );

    // Apply name boost using node names.
    const idMeta = new Map<
      number,
      { name: string; kind: string; file: string; line: number; signature: string | null }
    >();
    const loadMeta = db.prepare(
      `SELECT n.id, n.name, n.kind, f.path AS file, n.start_line AS line, n.signature
       FROM nodes n JOIN files f ON f.id = n.file_id WHERE n.id = ?`,
    );
    for (const id of fused.keys()) {
      const row = loadMeta.get(id) as
        | {
            id: number;
            name: string;
            kind: string;
            file: string;
            line: number;
            signature: string | null;
          }
        | undefined;
      if (row) {
        idMeta.set(id, {
          name: row.name,
          kind: row.kind,
          file: row.file,
          line: row.line,
          signature: row.signature,
        });
        const boosted = (fused.get(id) ?? 0) * nameBoost(row.name, q);
        fused.set(id, boosted);
      }
    }

    let seeds = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, seedLimit);

    // Empty / stopword query: top by global pagerank in focus (or global).
    if (!q || seeds.length === 0) {
      const rows =
        focus.length > 0
          ? (db
              .prepare(
                `SELECT n.id, pr.score FROM pagerank pr
                 JOIN nodes n ON n.id = pr.node_id
                 JOIN files f ON f.id = n.file_id
                 WHERE f.path IN (${focus.map(() => "?").join(",")})
                 ORDER BY pr.score DESC LIMIT ?`,
              )
              .all(...focus, seedLimit) as Array<{ id: number; score: number }>)
          : (db
              .prepare(
                `SELECT n.id, pr.score FROM pagerank pr
                 JOIN nodes n ON n.id = pr.node_id
                 ORDER BY pr.score DESC LIMIT ?`,
              )
              .all(seedLimit) as Array<{ id: number; score: number }>);
      seeds = rows.map((r) => [r.id, r.score] as [number, number]);
      for (const [id] of seeds) {
        if (!idMeta.has(id)) {
          const row = loadMeta.get(id) as
            | {
                name: string;
                kind: string;
                file: string;
                line: number;
                signature: string | null;
              }
            | undefined;
          if (row) idMeta.set(id, row);
        }
      }
    }

    // Ego-graph expand (1-hop, degree-capped).
    const expanded = new Set(seeds.map(([id]) => id));
    const hopOf = new Map<number, number>();
    for (const [id] of seeds) hopOf.set(id, 0);
    const neigh = db.prepare(
      `SELECT dst_node_id AS id FROM edges
       WHERE src_node_id = ? AND kind = 'call' AND dst_node_id IS NOT NULL
       UNION
       SELECT src_node_id AS id FROM edges
       WHERE dst_node_id = ? AND kind = 'call' AND src_node_id IS NOT NULL`,
    );
    for (const [id] of seeds) {
      const rows = neigh.all(id, id) as Array<{ id: number }>;
      const capped = rows.slice(0, MAX_DEGREE);
      for (const r of capped) {
        if (!expanded.has(r.id)) {
          expanded.add(r.id);
          hopOf.set(r.id, 1);
          if (!idMeta.has(r.id)) {
            const row = loadMeta.get(r.id) as
              | {
                  name: string;
                  kind: string;
                  file: string;
                  line: number;
                  signature: string | null;
                }
              | undefined;
            if (row) idMeta.set(r.id, row);
          }
        }
      }
    }

    // Personalized PageRank on ego subgraph (symbols only for score table).
    const files = db.prepare("SELECT id, path FROM files").all() as Array<{
      id: number;
      path: string;
    }>;
    const pathByFileId = new Map(files.map((f) => [f.id, f.path]));
    const fileIdByPath = new Map(files.map((f) => [f.path, f.id]));
    const fileNodeId = (fid: number) => -fid;

    const subgraphNodes = [...expanded];
    const fileIdsNeeded = new Set<number>();
    for (const id of subgraphNodes) {
      const meta = idMeta.get(id);
      if (meta) {
        const fid = fileIdByPath.get(meta.file);
        if (fid !== undefined) fileIdsNeeded.add(fid);
      }
    }
    const prNodeIds = [...subgraphNodes, ...[...fileIdsNeeded].map((fid) => fileNodeId(fid))];

    const defCount = new Map<string, number>();
    const allNames = db.prepare("SELECT name FROM nodes").all() as Array<{ name: string }>;
    for (const r of allNames) defCount.set(r.name, (defCount.get(r.name) ?? 0) + 1);
    const refCount = new Map<string, number>();
    const mentioned = new Set(q.split(/[^A-Za-z0-9_$]+/).filter((t) => t.length > 1));

    const prEdges: PrEdge[] = [];
    for (const fid of fileIdsNeeded) {
      const kids = db.prepare("SELECT id, name FROM nodes WHERE file_id = ?").all(fid) as Array<{
        id: number;
        name: string;
      }>;
      for (const k of kids) {
        if (!expanded.has(k.id)) continue;
        prEdges.push({ from: fileNodeId(fid), to: k.id, weight: 1 });
      }
    }
    const edgeRows =
      subgraphNodes.length === 0
        ? []
        : (db
            .prepare(
              `SELECT e.src_node_id, e.dst_node_id, e.dst_name, e.src_file_id
               FROM edges e
               WHERE e.kind = 'call'
                 AND e.src_node_id IS NOT NULL AND e.dst_node_id IS NOT NULL
                 AND e.src_node_id IN (${subgraphNodes.map(() => "?").join(",")})
                 AND e.dst_node_id IN (${subgraphNodes.map(() => "?").join(",")})`,
            )
            .all(...subgraphNodes, ...subgraphNodes) as Array<{
            src_node_id: number;
            dst_node_id: number;
            dst_name: string;
            src_file_id: number;
          }>);
    for (const e of edgeRows) {
      refCount.set(e.dst_name, (refCount.get(e.dst_name) ?? 0) + 1);
      const srcPath = pathByFileId.get(e.src_file_id) ?? "";
      const w = edgeWeightMul(e.dst_name, srcPath, {
        mentionedIdents: mentioned,
        focusFiles: focusSet,
        defCount,
        refCount,
      });
      prEdges.push({ from: e.src_node_id, to: e.dst_node_id, weight: w });
    }

    const personalize = focus
      .map((p) => fileIdByPath.get(p))
      .filter((id): id is number => id !== undefined)
      .map(fileNodeId);

    const prScores =
      subgraphNodes.length > 0
        ? personalizedPageRank(prNodeIds, prEdges, personalize)
        : new Map<number, number>();

    // Fallback to global pagerank table when PR missing.
    const globalPr = db.prepare("SELECT score FROM pagerank WHERE node_id = ?");

    // Churn: cheap proxy — skip full git history; use 0 when unavailable.
    const commits30 = 0;

    const seedMap = new Map(seeds);
    const candidates = [...expanded].filter((id) => idMeta.has(id));
    const ranked = candidates
      .map((id) => {
        const meta = idMeta.get(id)!;
        const seed = seedMap.get(id) ?? (prScores.get(id) ?? 0) * 0.01;
        const pagerank =
          prScores.get(id) ?? (globalPr.get(id) as { score: number } | undefined)?.score ?? 1e-9;
        const hops = hopOf.get(id) ?? 2;
        const isDef = /^(function|class|method|type|interface|enum)$/.test(meta.kind);
        const score = structuralScore(seed, {
          pagerank,
          commits30d: commits30,
          hopsToFocus: focus.length === 0 ? 0 : hops,
          isDefinition: isDef,
        });
        return {
          nodeId: id,
          name: meta.name,
          kind: meta.kind,
          file: meta.file,
          line: meta.line,
          signature: meta.signature,
          signals: {
            bm25Rank: bm25Rank.get(id),
            knnRank: knnRank.get(id),
            nameRank: nameRank.get(id),
            pagerank,
            hops,
            score,
          },
        } satisfies HybridHit;
      })
      .sort((a, b) => b.signals.score - a.signals.score);

    if (focus.length > 0) {
      const known = new Set(files.map((f) => f.path));
      if (focus.every((p) => !known.has(p))) {
        degraded.push("focus-unindexed");
      }
    }

    const budgetHits: BudgetHit[] = ranked.map((h) => ({
      name: h.name,
      kind: h.kind,
      file: h.file,
      line: h.line,
      signature: h.signature,
    }));
    const fitted = fitToBudget(budgetHits, budget);
    const finalHits = ranked.slice(0, fitted.hitCount);

    return {
      rendered: fitted.rendered,
      tokens: fitted.tokens,
      budget: fitted.budget,
      route,
      focus,
      hits: finalHits,
      degraded,
    };
  } finally {
    db.close();
  }
}
