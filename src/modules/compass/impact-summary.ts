import type { ImpactModule, ImpactResult } from "./query.js";

/** Aggregated blast-radius block shared by explore and diff-context. */
export interface BlastRadiusSummary {
  totalNodes: number;
  totalFiles: number;
  totalModules: number;
  byModule: Array<{ module: string; nodes: number; files: number; minDepth: number }>;
  reachesPublicApi: boolean;
  maxDepthReached: boolean;
  truncated: boolean;
  topNodes: Array<{ name: string; file: string; depth: number }>;
}

/**
 * Convert a grouped {@link ImpactResult} into a compact blast-radius summary.
 *
 * @param impact - Grouped impact output from Compass.
 */
export function summarizeImpact(impact: ImpactResult): BlastRadiusSummary {
  const topNodes: BlastRadiusSummary["topNodes"] = [];
  for (const mod of impact.modules) {
    for (const n of mod.top) {
      topNodes.push({ name: n.name, file: n.file, depth: n.depth });
      if (topNodes.length >= 15) break;
    }
    if (topNodes.length >= 15) break;
  }
  const reachesPublicApi = impact.modules.some(
    (m) => m.module.includes("public") || m.module === "api" || m.module.endsWith("/api"),
  );
  return {
    totalNodes: impact.totals.nodes,
    totalFiles: impact.totals.files,
    totalModules: impact.totals.modules,
    byModule: impact.modules.map((m: ImpactModule) => ({
      module: m.module,
      nodes: m.nodes,
      files: m.files,
      minDepth: m.minDepth,
    })),
    reachesPublicApi,
    maxDepthReached: impact.limits.maxDepthReached,
    truncated: impact.limits.truncated,
    topNodes,
  };
}
