import { explore, impact, trace, type ExploreResult } from "./query.js";
import { affectedTests, type AffectedTestCommand } from "./affected.js";
import { FILE_NODE_KIND, indexExists, openDb } from "./db.js";
import type { FindResult } from "./find-output.js";
import { hotspots } from "./hotspots.js";
import { summarizeImpact, type BlastRadiusSummary } from "./impact-summary.js";
import {
  budgetExploreShape,
  applyTextBudget,
  OUTPUT_BUDGET,
  type OutputMode,
  type TruncationEntry,
} from "../../shared/output-budget.js";

export type ExploreInclude =
  "source" | "callers" | "callees" | "blast_radius" | "tests" | "hotspot";

export interface ExploreRichQuery {
  projectPath: string;
  node: string;
  to?: string;
  include?: ExploreInclude[];
  mode?: OutputMode;
  maxDepth?: number;
}

export interface ExploreRichResult extends ExploreResult {
  blastRadius?: BlastRadiusSummary;
  affectedTests?: {
    count: number;
    files: string[];
    /** Command to run from the repository root, or null when no test is reachable. */
    command: string | null;
    commandReason: string;
    commands: AffectedTestCommand[];
  };
  hotspot?: {
    file: string;
    combinedScore: number;
    churn: number;
    complexity: number;
    rank: number;
  };
  path?: string[] | null;
  /**
   * The symbols below this one — the callee tree to `maxDepth` (> 1), or the
   * call path to `to` — each with its source when `source` is included, so a
   * whole chain reads in one call instead of one file read per hop.
   */
  chain?: ChainNode[];
  truncated?: TruncationEntry[];
  degraded?: Array<"no-index" | "no-tests-data" | "no-hotspots">;
}

/** One symbol on a call chain (see {@link ExploreRichResult.chain}). */
export interface ChainNode {
  name: string;
  file: string;
  startLine: number;
  /** Hops from the explored symbol. */
  depth: number;
  source?: string;
}

/** Chain limits per output mode: nodes, and source lines per node. */
const CHAIN_LIMITS = { brief: { nodes: 8, lines: 25 }, full: { nodes: 20, lines: 80 } } as const;

function chainNode(
  projectPath: string,
  name: string,
  depth: number,
  withSource: boolean,
  maxLines: number,
): { node: ChainNode; callees: string[] } | null {
  const ex = explore(projectPath, name);
  if (!ex.found || !ex.symbol) return null;
  const node: ChainNode = {
    name: ex.symbol.name,
    file: ex.symbol.file,
    startLine: ex.symbol.startLine,
    depth,
  };
  if (withSource && ex.symbol.source) {
    const lines = ex.symbol.source.split("\n");
    node.source =
      lines.length > maxLines ? lines.slice(0, maxLines).join("\n") + "\n…" : ex.symbol.source;
  }
  return { node, callees: (ex.callees ?? []).map((c) => c.name) };
}

/**
 * Breadth-first callee tree below `root` to `maxDepth`, capped per mode; or,
 * with `path`, the symbols along that call path. Records a truncation when the
 * node cap cut the walk short.
 */
function buildChain(
  projectPath: string,
  root: string,
  rootCallees: string[],
  opts: { maxDepth: number; path?: string[] | null; withSource: boolean; mode: OutputMode },
  truncated: TruncationEntry[],
): ChainNode[] {
  const limits = CHAIN_LIMITS[opts.mode];
  const out: ChainNode[] = [];
  if (opts.path) {
    opts.path.slice(1).forEach((name, i) => {
      const hit = chainNode(projectPath, name, i + 1, opts.withSource, limits.lines);
      if (hit && out.length < limits.nodes) out.push(hit.node);
    });
    return out;
  }
  const seen = new Set([root]);
  let frontier = rootCallees.map((name) => ({ name, depth: 1 }));
  let skipped = 0;
  while (frontier.length) {
    const next: Array<{ name: string; depth: number }> = [];
    for (const { name, depth } of frontier) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (out.length >= limits.nodes) {
        skipped++;
        continue;
      }
      const hit = chainNode(projectPath, name, depth, opts.withSource, limits.lines);
      if (!hit) continue;
      out.push(hit.node);
      if (depth < opts.maxDepth)
        next.push(...hit.callees.map((c) => ({ name: c, depth: depth + 1 })));
    }
    frontier = next;
  }
  if (skipped) {
    truncated.push({
      field: "chain",
      omitted: skipped,
      hint: 'use mode:"full", a lower maxDepth, or to:<symbol> for one path',
    });
  }
  return out;
}

const DEFAULT_INCLUDES: ExploreInclude[] = [
  "source",
  "callers",
  "callees",
  "blast_radius",
  "tests",
];

function withoutSource(
  symbol: NonNullable<ExploreResult["symbol"]>,
): NonNullable<ExploreResult["symbol"]> {
  const { source: _omit, ...rest } = symbol;
  return { ...rest, source: "" };
}

/**
 * Enriched symbol context: explore plus optional blast radius, tests, hotspot,
 * and call path when `to` is set.
 *
 * @param query - Project path, symbol, includes, and output mode.
 */
export async function exploreRich(query: ExploreRichQuery): Promise<ExploreRichResult> {
  const includes = query.include ?? DEFAULT_INCLUDES;
  const mode = query.mode ?? "brief";
  const truncated: TruncationEntry[] = [];
  const degraded: ExploreRichResult["degraded"] = [];

  if (query.to) {
    const pathResult = trace(query.projectPath, query.node, query.to, query.maxDepth ?? 8);
    const base = explore(query.projectPath, query.node, { includeRefs: true });
    const out: ExploreRichResult = {
      ...base,
      path: pathResult.path,
      truncated,
      degraded,
      message: pathResult.path
        ? `Call path ${query.node} → ${query.to} (${pathResult.hops} hop(s))`
        : `No call path found within depth limit`,
    };
    if (pathResult.path && pathResult.path.length > 1) {
      out.chain = buildChain(
        query.projectPath,
        query.node,
        [],
        { maxDepth: 0, path: pathResult.path, withSource: includes.includes("source"), mode },
        truncated,
      );
    }
    if (!includes.includes("source") && out.symbol) out.symbol = withoutSource(out.symbol);
    if (!includes.includes("callers")) out.callers = [];
    if (!includes.includes("callees")) {
      out.callees = [];
      delete out.unresolvedCallees;
    }
    budgetExploreShape(out as unknown as Record<string, unknown>, mode, truncated);
    return out;
  }

  const base = explore(query.projectPath, query.node, { includeRefs: true });
  const out: ExploreRichResult = { ...base, truncated, degraded };
  if (base.found && base.symbol && includes.includes("callees") && (query.maxDepth ?? 1) > 1) {
    out.chain = buildChain(
      query.projectPath,
      base.symbol.name,
      (base.callees ?? []).map((c) => c.name),
      { maxDepth: query.maxDepth ?? 1, withSource: includes.includes("source"), mode },
      truncated,
    );
  }

  if (!includes.includes("source") && out.symbol) out.symbol = withoutSource(out.symbol);
  if (!includes.includes("callers")) out.callers = [];
  if (!includes.includes("callees")) {
    out.callees = [];
    delete out.unresolvedCallees;
  }

  if (base.found && base.symbol) {
    const sym = base.symbol.name;
    const file = base.symbol.file;

    if (includes.includes("blast_radius")) {
      try {
        const imp = impact(query.projectPath, {
          ...(base.symbol.kind === FILE_NODE_KIND ? { files: [file] } : { symbol: sym }),
          maxDepth: query.maxDepth ?? 4,
          format: "grouped",
        });
        out.blastRadius = summarizeImpact(imp);
      } catch {
        degraded.push("no-index");
      }
    }

    if (includes.includes("tests")) {
      try {
        // A file-owner node is named by its path: select by file, not by name.
        const at = affectedTests(
          query.projectPath,
          base.symbol.kind === FILE_NODE_KIND
            ? { files: [file], maxDepth: query.maxDepth ?? 6 }
            : { symbols: [sym], maxDepth: query.maxDepth ?? 6 },
        );
        out.affectedTests = {
          count: at.tests.length,
          files: at.tests.map((t) => t.file),
          command: at.command,
          commandReason: at.commandReason,
          commands: at.commands,
        };
      } catch {
        degraded.push("no-tests-data");
      }
    }

    if (includes.includes("hotspot")) {
      try {
        const hs = hotspots(query.projectPath, { sortBy: "combined", limit: 200 });
        const idx = hs.hotspots.findIndex((h) => h.file === file);
        if (idx >= 0) {
          const h = hs.hotspots[idx]!;
          out.hotspot = {
            file: h.file,
            combinedScore: h.combinedScore,
            churn: h.activity.commits,
            complexity: h.health?.worstLoc ?? 0,
            rank: idx + 1,
          };
        } else {
          degraded.push("no-hotspots");
        }
      } catch {
        degraded.push("no-hotspots");
      }
    }
  }

  budgetExploreShape(out as unknown as Record<string, unknown>, mode, truncated);
  if (truncated.length === 0) delete out.truncated;
  if (degraded.length === 0) delete out.degraded;
  return out;
}

/**
 * Merge lexical and semantic search behind one surface (the MCP find path).
 * The focus is resolved against the index first so dropped paths can be
 * reported; exact mode keeps only symbols named exactly a query term and
 * reports `found`, `terms`, and, when nothing matches, `nearest`.
 *
 * @param projectPath - Indexed project root.
 * @param query - Identifier(s) or prose.
 * @param mode - `exact` (name lookup) or `concept` (fuzzy, dense-heavy).
 * @param limit - Seed limit (default 50).
 * @param opts - Focus paths and the response token cap (default: brief ceiling).
 */
// Covers: req~find-exact-not-found~1, req~task-relative-ranking~1
export async function findSymbols(
  projectPath: string,
  query: string,
  mode: "exact" | "concept",
  limit?: number,
  opts?: { focus?: string[]; maxTokens?: number },
): Promise<FindResult> {
  const { hybridSearch, resolveSearchFocus, exactTerms, nearestSymbols } =
    await import("./hybrid.js");
  if (!indexExists(projectPath)) {
    throw new Error(
      "No index found. Build it first with the index_build tool (creates .speclaw/index.db).",
    );
  }
  const db = openDb(projectPath);
  let resolvedFocus;
  try {
    resolvedFocus = resolveSearchFocus(db, projectPath, opts?.focus);
  } finally {
    db.close();
  }
  const cap = opts?.maxTokens ?? OUTPUT_BUDGET.brief;
  const terms = mode === "exact" ? exactTerms(query) : undefined;
  const report = { ranked: 0, knnIds: [] as number[] };
  const result = await hybridSearch(projectPath, query, {
    mode,
    maxTokens: cap,
    seedLimit: limit ?? 50,
    resolvedFocus,
    exactNames: terms,
    report,
  });
  const out: FindResult = {
    ...result,
    mode,
    focusIgnored: resolvedFocus.ignored,
    cap,
    capped: report.ranked > result.hits.length,
  };
  if (terms) {
    out.terms = terms;
    out.found = result.hits.length > 0;
    if (!out.found) out.nearest = nearestSymbols(projectPath, terms, report.knnIds);
  }
  return out;
}

/** Serialize explore-rich with output budget applied. */
export function formatExploreRich(result: ExploreRichResult, mode: OutputMode = "brief"): string {
  const json = JSON.stringify(result, null, 2);
  return applyTextBudget(json, mode).text;
}
