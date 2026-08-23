import type { DatabaseSync } from "node:sqlite";
import { GraphRule, Law } from "./laws.js";
import type { Finding } from "./verify-model.js";
import type { EngineResult } from "./deps.js";
import { underPaths } from "./verify-model.js";

// Motor C — the `graph` backend: dependency cycles and transitive reachability
// over the file-level import graph. Cycle detection uses an ITERATIVE Tarjan (a
// recursive SCC pass overflows the stack on deep import chains) and reports the
// minimal cycle inside a component, not the whole component — a 3-file cycle is
// actionable, a 40-file SCC is not. Intra-file self-dependencies are excluded
// from the graph: at file granularity they are not cycles.

/** A directed file→file graph as an adjacency map. */
type Adj = Map<string, string[]>;

/** Build the cross-file dependency graph, restricted to `paths` when given. */
function buildGraph(db: DatabaseSync, paths: string[] | undefined, edgeKinds?: string[]): Adj {
  const kindFilter =
    edgeKinds && edgeKinds.length > 0
      ? ` AND e.kind IN (${edgeKinds.map(() => "?").join(", ")})`
      : "";
  const rows = db
    .prepare(
      `SELECT DISTINCT sf.path AS src, df.path AS dst
       FROM edges e
       JOIN files sf ON sf.id = e.src_file_id
       JOIN nodes dn ON dn.id = e.dst_node_id
       JOIN files df ON df.id = dn.file_id
       WHERE e.dst_node_id IS NOT NULL AND sf.path <> df.path${kindFilter}`,
    )
    .all(...(edgeKinds && edgeKinds.length > 0 ? edgeKinds : [])) as unknown as Array<{
    src: string;
    dst: string;
  }>;
  const adj: Adj = new Map();
  for (const { src, dst } of rows) {
    if (!underPaths(src, paths) || !underPaths(dst, paths)) continue;
    const list = adj.get(src);
    if (list) list.push(dst);
    else adj.set(src, [dst]);
    if (!adj.has(dst)) adj.set(dst, []);
  }
  return adj;
}

/**
 * Iterative Tarjan strongly-connected-components. Written with an explicit work
 * stack so a deep import chain cannot overflow the call stack.
 *
 * @param adj - The directed graph.
 * @returns The list of SCCs, each a list of node ids.
 */
export function tarjanSCC(adj: Adj): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  // Each work-stack frame tracks a node and how far through its neighbors we are.
  interface Frame {
    node: string;
    i: number;
  }

  for (const root of adj.keys()) {
    if (index.has(root)) continue;
    const work: Frame[] = [{ node: root, i: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const { node } = frame;
      if (frame.i === 0) {
        index.set(node, counter);
        low.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
      }
      const neighbors = adj.get(node) ?? [];
      if (frame.i < neighbors.length) {
        const next = neighbors[frame.i]!;
        frame.i++;
        if (!index.has(next)) {
          work.push({ node: next, i: 0 });
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node)!, index.get(next)!));
        }
        continue;
      }
      // All neighbors visited: settle this node, propagating low-links up.
      if (low.get(node) === index.get(node)) {
        const scc: string[] = [];
        for (;;) {
          const w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
          if (w === node) break;
        }
        sccs.push(scc);
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(node)!));
    }
  }
  return sccs;
}

/**
 * The shortest cycle passing through `start`, via BFS over the induced subgraph.
 *
 * @param start - The node to find a return path to.
 * @param within - The set of nodes the search is restricted to (one SCC).
 * @param adj - The full graph.
 * @returns The cycle as an ordered node list `[start, …]`, or null if none.
 */
function shortestCycleThrough(start: string, within: Set<string>, adj: Adj): string[] | null {
  const parent = new Map<string, string>();
  const visited = new Set<string>([start]);
  let queue: string[] = [start];
  while (queue.length > 0) {
    const next: string[] = [];
    for (const node of queue) {
      for (const neighbor of adj.get(node) ?? []) {
        if (!within.has(neighbor)) continue;
        if (neighbor === start) {
          // Reconstruct start → … → node, which closes back to start.
          const path = [node];
          let cur = node;
          while (cur !== start) {
            cur = parent.get(cur)!;
            path.push(cur);
          }
          path.reverse();
          return path;
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, node);
          next.push(neighbor);
        }
      }
    }
    queue = next;
  }
  return null;
}

/** Findings for the `circular` rule: one minimal cycle per multi-node SCC. */
function circularFindings(law: Law, adj: Adj): Finding[] {
  const findings: Finding[] = [];
  for (const scc of tarjanSCC(adj)) {
    if (scc.length < 2) continue;
    const within = new Set(scc);
    let best: string[] | null = null;
    for (const node of scc) {
      const cycle = shortestCycleThrough(node, within, adj);
      if (cycle && (best === null || cycle.length < best.length)) best = cycle;
    }
    if (!best) continue;
    findings.push({
      lawId: law.id,
      severity: law.severity,
      engine: "graph",
      file: best[0]!,
      message: law.prose,
      detail: `cycle: ${[...best, best[0]!].join(" → ")} (SCC size ${scc.length})`,
    });
  }
  return findings;
}

/** Findings for the `reachable` rule: a `from` file transitively reaches a `to` file. */
function reachableFindings(law: Law, rule: GraphRule, adj: Adj): Finding[] {
  const fromRe = new RegExp(rule.from!);
  const toRe = new RegExp(rule.to!);
  const findings: Finding[] = [];
  for (const src of adj.keys()) {
    if (!fromRe.test(src)) continue;
    const seen = new Set<string>([src]);
    let queue = [src];
    let hit: string | null = null;
    while (queue.length > 0 && !hit) {
      const next: string[] = [];
      for (const node of queue) {
        for (const neighbor of adj.get(node) ?? []) {
          if (seen.has(neighbor)) continue;
          if (toRe.test(neighbor)) {
            hit = neighbor;
            break;
          }
          seen.add(neighbor);
          next.push(neighbor);
        }
        if (hit) break;
      }
      queue = next;
    }
    if (hit) {
      findings.push({
        lawId: law.id,
        severity: law.severity,
        engine: "graph",
        file: src,
        message: law.prose,
        detail: `transitively reaches ${hit}`,
      });
    }
  }
  return findings;
}

/**
 * Evaluate one `graph` law: forbidden dependency cycles and/or forbidden
 * transitive reachability, over the file-level import graph.
 *
 * @param db - An open connection to the project's index.
 * @param law - The `graph` law to evaluate.
 * @param paths - Optional project-relative paths restricting the graph.
 * @returns The findings; `unresolved` is always 0 (cycles are read off the
 *   resolved graph, so a graph law never reports an unknown here).
 */
export function runGraphLaw(db: DatabaseSync, law: Law, paths?: string[]): EngineResult {
  const rule = (law.verification as { kind: "graph"; rule: GraphRule }).rule;
  const adj = buildGraph(db, paths, rule.edgeKinds);
  const findings: Finding[] = [];

  const wantReachable = rule.reachable === true && rule.from != null && rule.to != null;
  const wantCircular = rule.circular === true || (!rule.circular && !wantReachable);

  if (wantCircular) findings.push(...circularFindings(law, adj));
  if (wantReachable) findings.push(...reachableFindings(law, rule, adj));

  return { findings, unresolved: 0 };
}
