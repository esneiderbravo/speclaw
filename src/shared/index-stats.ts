import fs from "node:fs";
import path from "node:path";

/**
 * Totals of the last index run, kept beside the index as plain JSON so hot
 * paths (the hooks) can size the repo without opening the database.
 */
export const INDEX_STATS_FILE = path.join(".speclaw", "index-stats.json");

/** Index totals as written by {@link writeIndexStats}. */
export interface IndexStatsFile {
  files: number;
  nodes: number;
}

/**
 * Record the index totals after a run. Best-effort: a failed write never fails
 * the index.
 *
 * @param projectPath - Project root.
 * @param totals - Whole-repository counts after the run.
 */
export function writeIndexStats(projectPath: string, totals: IndexStatsFile): void {
  try {
    const file = path.join(projectPath, INDEX_STATS_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ files: totals.files, nodes: totals.nodes }) + "\n");
  } catch {
    // The stats are an optimization for hooks; the index itself is intact.
  }
}

/**
 * The last index run's totals, or null when no run recorded them.
 *
 * @param projectPath - Project root.
 */
export function readIndexStats(projectPath: string): IndexStatsFile | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(projectPath, INDEX_STATS_FILE), "utf8"),
    ) as Partial<IndexStatsFile>;
    return typeof raw.files === "number"
      ? { files: raw.files, nodes: typeof raw.nodes === "number" ? raw.nodes : 0 }
      : null;
  } catch {
    return null;
  }
}
