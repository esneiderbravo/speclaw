import { explore, impact, trace, search, recall, type ExploreResult } from "./query.js";
import { affectedTests } from "./affected.js";
import { hotspots } from "./hotspots.js";
import { summarizeImpact, type BlastRadiusSummary } from "./impact-summary.js";
import {
  budgetExploreShape,
  applyTextBudget,
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
  affectedTests?: { count: number; files: string[]; command?: string };
  hotspot?: {
    file: string;
    combinedScore: number;
    churn: number;
    complexity: number;
    rank: number;
  };
  path?: string[] | null;
  truncated?: TruncationEntry[];
  degraded?: Array<"no-index" | "no-tests-data" | "no-hotspots">;
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
    const base = explore(query.projectPath, query.node);
    const out: ExploreRichResult = {
      ...base,
      path: pathResult.path,
      truncated,
      degraded,
      message: pathResult.path
        ? `Call path ${query.node} → ${query.to} (${pathResult.hops} hop(s))`
        : `No call path found within depth limit`,
    };
    if (!includes.includes("source") && out.symbol) out.symbol = withoutSource(out.symbol);
    if (!includes.includes("callers")) out.callers = [];
    if (!includes.includes("callees")) out.callees = [];
    budgetExploreShape(out as unknown as Record<string, unknown>, mode, truncated);
    return out;
  }

  const base = explore(query.projectPath, query.node);
  const out: ExploreRichResult = { ...base, truncated, degraded };

  if (!includes.includes("source") && out.symbol) out.symbol = withoutSource(out.symbol);
  if (!includes.includes("callers")) out.callers = [];
  if (!includes.includes("callees")) out.callees = [];

  if (base.found && base.symbol) {
    const sym = base.symbol.name;
    const file = base.symbol.file;

    if (includes.includes("blast_radius")) {
      try {
        const imp = impact(query.projectPath, {
          symbol: sym,
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
        const at = affectedTests(query.projectPath, {
          symbols: [sym],
          maxDepth: query.maxDepth ?? 6,
        });
        out.affectedTests = {
          count: at.tests.length,
          files: at.tests.map((t) => t.file),
          command: at.command,
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

/** Merge lexical and semantic search behind one surface. */
export async function findSymbols(
  projectPath: string,
  query: string,
  mode: "exact" | "concept",
  limit?: number,
): Promise<unknown> {
  if (mode === "exact") return search(projectPath, query, limit ?? 25);
  return recall(projectPath, query, limit ?? 15);
}

/** Serialize explore-rich with output budget applied. */
export function formatExploreRich(result: ExploreRichResult, mode: OutputMode = "brief"): string {
  const json = JSON.stringify(result, null, 2);
  return applyTextBudget(json, mode).text;
}
