/**
 * Hybrid retrieval ranking primitives: query routing, RRF fusion, name boost,
 * and structural rerank multipliers. Pure functions — no I/O.
 */

/** Reciprocal Rank Fusion constant (Cormack et al., SIGIR 2009). */
export const RRF_K = 60;

/** Max neighbours expanded per hub node during ego-graph growth. */
export const MAX_DEGREE = 200;

/** Weights applied to the three candidate lists before RRF. */
export interface RouteWeights {
  bm25: number;
  knn: number;
  name: number;
}

/**
 * True when `q` looks like a single identifier (optionally dotted), not prose.
 *
 * @param q - Raw user query.
 */
export function isSymbolQuery(q: string): boolean {
  const t = q.trim();
  return /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(t) && t.split(/\s+/).length === 1;
}

/**
 * Route list weights from query shape (PL→PL sparse-heavy; NL→PL dense-heavy).
 *
 * @param q - Raw user query.
 */
export function routeWeights(q: string): RouteWeights {
  return isSymbolQuery(q) ? { bm25: 1.0, knn: 0.3, name: 1.0 } : { bm25: 0.7, knn: 1.0, name: 0.5 };
}

/**
 * Reciprocal Rank Fusion over named ranked lists.
 *
 * @param lists - Map of list name → ordered node ids (best first).
 * @param weights - Per-list multipliers (missing → 1).
 * @param k - RRF constant (default {@link RRF_K}).
 * @returns Map of node id → fused score (higher is better).
 */
export function rrfFuse(
  lists: Record<string, number[]>,
  weights: Record<string, number> = {},
  k = RRF_K,
): Map<number, number> {
  const scores = new Map<number, number>();
  for (const [name, ranked] of Object.entries(lists)) {
    const w = weights[name] ?? 1;
    ranked.forEach((id, i) => {
      const rank = i + 1;
      scores.set(id, (scores.get(id) ?? 0) + w / (k + rank));
    });
  }
  return scores;
}

/**
 * Multiplicative name-match boost after RRF.
 *
 * @param name - Candidate symbol name.
 * @param query - Original query string.
 * @returns Multiplier ≥ 1.
 */
export function nameBoost(name: string, query: string): number {
  const q = query.trim();
  if (!q) return 1;
  let boost = 1;
  if (name === q) boost += 2.0;
  else if (name.toLowerCase() === q.toLowerCase()) boost += 0.5;
  if (name.startsWith(q) || name.toLowerCase().startsWith(q.toLowerCase())) boost += 0.25;
  return boost;
}

/** Inputs for the structural rerank stage. */
export interface StructuralSignals {
  pagerank: number;
  commits30d: number;
  hopsToFocus: number;
  isDefinition: boolean;
  coveredByBrokenTest?: boolean;
}

/**
 * Structural rerank multiplier (PageRank, churn, hops, kind). Never uses
 * directory path-distance.
 *
 * @param seed - Fused seed score (already includes name boost).
 * @param s - Structural signals for the candidate.
 */
export function structuralScore(seed: number, s: StructuralSignals): number {
  const pr = Math.max(s.pagerank, 1e-12);
  const churn = 1 + Math.log1p(Math.max(0, s.commits30d)) / Math.log(30);
  const hops = 1 / (1 + Math.max(0, s.hopsToFocus));
  const kind = s.isDefinition ? 1.0 : 0.4;
  const testBoost = s.coveredByBrokenTest ? 1.5 : 1.0;
  return seed * Math.sqrt(pr) * churn * hops * kind * testBoost;
}

/**
 * Escape a free-text query for FTS5 MATCH by quoting each term.
 *
 * @param q - Raw user query (may contain AND, quotes, NEAR, *).
 * @returns Safe MATCH expression, or empty string when no terms remain.
 */
export function escapeFtsQuery(q: string): string {
  const terms = q
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '""'))
    .filter((t) => t.length > 0);
  if (terms.length === 0) return "";
  return terms.map((t) => `"${t}"`).join(" ");
}
