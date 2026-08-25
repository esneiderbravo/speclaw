/**
 * Personalized PageRank over a bipartite file↔symbol graph (query-time and
 * global precompute). Pure numeric iteration — callers supply adjacency.
 */

/** Directed weighted edge. */
export interface PrEdge {
  from: number;
  to: number;
  weight: number;
}

export interface PageRankOptions {
  /** Damping factor (default 0.85). */
  alpha?: number;
  /** Max iterations (default 20). */
  maxIter?: number;
  /** L1 convergence threshold (default 1e-6). */
  tol?: number;
}

/**
 * Run personalized PageRank.
 *
 * @param nodeIds - All node ids in the graph (files and/or symbols).
 * @param edges - Weighted directed edges.
 * @param personalize - Focus node ids; empty → uniform over `nodeIds`.
 * @param opts - Iteration controls.
 * @returns Map of node id → score (approximately sums to 1).
 */
export function personalizedPageRank(
  nodeIds: number[],
  edges: PrEdge[],
  personalize: number[] = [],
  opts: PageRankOptions = {},
): Map<number, number> {
  const alpha = opts.alpha ?? 0.85;
  const maxIter = opts.maxIter ?? 20;
  const tol = opts.tol ?? 1e-6;

  const ids = [...new Set(nodeIds)];
  if (ids.length === 0) return new Map();

  const index = new Map<number, number>();
  ids.forEach((id, i) => index.set(id, i));
  const n = ids.length;

  const p = new Float64Array(n);
  const focus = personalize.filter((id) => index.has(id));
  if (focus.length === 0) {
    const u = 1 / n;
    for (let i = 0; i < n; i++) p[i] = u;
  } else {
    const u = 1 / focus.length;
    for (const id of focus) p[index.get(id)!] = u;
  }

  const outW = new Float64Array(n);
  const adj: Array<Array<{ to: number; w: number }>> = Array.from({ length: n }, () => []);
  for (const e of edges) {
    const fi = index.get(e.from);
    const ti = index.get(e.to);
    if (fi === undefined || ti === undefined) continue;
    const w = Math.max(e.weight, 0);
    if (w === 0) continue;
    adj[fi]!.push({ to: ti, w });
    outW[fi]! += w;
  }

  // Self-loop 0.1 for nodes with no outbound mass so they stay in the walk.
  for (let i = 0; i < n; i++) {
    if (outW[i]! === 0) {
      adj[i]!.push({ to: i, w: 0.1 });
      outW[i] = 0.1;
    }
  }

  let pr = new Float64Array(p);
  let next = new Float64Array(n);

  for (let iter = 0; iter < maxIter; iter++) {
    next.fill(0);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (outW[i]! === 0) dangling += pr[i]!;
    }
    for (let i = 0; i < n; i++) {
      next[i]! += (1 - alpha) * p[i]!;
      next[i]! += alpha * dangling * p[i]!;
    }
    for (let i = 0; i < n; i++) {
      const ow = outW[i]!;
      if (ow === 0) continue;
      const share = (alpha * pr[i]!) / ow;
      for (const { to, w } of adj[i]!) {
        next[to]! += share * w;
      }
    }
    let delta = 0;
    for (let i = 0; i < n; i++) delta += Math.abs(next[i]! - pr[i]!);
    const tmp = pr;
    pr = next;
    next = tmp;
    if (delta < tol) break;
  }

  const out = new Map<number, number>();
  for (let i = 0; i < n; i++) out.set(ids[i]!, pr[i]!);
  return out;
}

/**
 * Heuristic: identifiers that look meaningful (camel/snake, length ≥ 8).
 *
 * @param name - Symbol name.
 */
export function isMeaningfulIdent(name: string): boolean {
  if (name.length < 8) return false;
  return /[a-z][A-Z]/.test(name) || name.includes("_");
}

/**
 * Edge weight multiplier adapted from aider's repo-map heuristics.
 *
 * @param dstName - Destination symbol name.
 * @param srcFilePath - Source file path (for focus ×50).
 * @param ctx - Ranking context bags.
 */
export function edgeWeightMul(
  dstName: string,
  srcFilePath: string,
  ctx: {
    mentionedIdents: Set<string>;
    focusFiles: Set<string>;
    defCount: Map<string, number>;
    refCount: Map<string, number>;
  },
): number {
  let mul = 1.0;
  if (ctx.mentionedIdents.has(dstName)) mul *= 10;
  if (isMeaningfulIdent(dstName)) mul *= 10;
  if (dstName.startsWith("_")) mul *= 0.1;
  if ((ctx.defCount.get(dstName) ?? 0) > 5) mul *= 0.1;
  if (ctx.focusFiles.has(srcFilePath)) mul *= 50;
  return mul * Math.sqrt(ctx.refCount.get(dstName) ?? 1);
}
