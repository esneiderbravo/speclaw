import { openDb } from "./db.js";
import { cachedCoChanges, cachedFileActivity } from "./git-history-cache.js";
import { jaccardStrength } from "../../shared/git-history.js";

/** Default history window for hotspot / coupling ranking. */
export const DEFAULT_WINDOW_DAYS = 90;

/** Default max files in a commit before coupling discards it. */
export const DEFAULT_MAX_FILES_PER_COMMIT = 50;

/** Default minimum shared commits for a coupling pair. */
export const DEFAULT_MIN_SHARED = 2;

export type HotspotSortBy = "churn" | "complexity" | "combined";

export interface HotspotActivity {
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  authors: number;
}

export interface HotspotHealth {
  worstLoc: number;
  worstNesting: number;
  worstBranches: number;
  symbols: number;
}

export interface HotspotEntry {
  file: string;
  activity: HotspotActivity;
  /** `null` when the file is not in the Compass index. */
  health: HotspotHealth | null;
  /** Documented heuristic for `sortBy: "combined"`; raw axes stay visible. */
  combinedScore: number;
}

export interface HotspotsReport {
  window: { days: number; since: string; label: string };
  sortBy: HotspotSortBy;
  hotspots: HotspotEntry[];
  diagnostics: {
    filesWithActivity: number;
    indexedHealthFiles: number;
  };
  warnings: string[];
}

export interface CouplingPartner {
  file: string;
  both: number;
  commitsSelf: number;
  commitsOther: number;
  strength: number;
  inGraph: boolean;
  isTestPair: boolean;
}

export interface CouplingReport {
  file: string;
  window: { days: number; since: string; label: string };
  partners: CouplingPartner[];
  diagnostics: {
    commitsScanned: number;
    skippedTooLarge: number;
    maxFilesPerCommit: number;
    minShared: number;
  };
  warnings: string[];
}

/** ISO date string for `git --since` N days ago (UTC calendar day). */
export function sinceDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Combined sort heuristic: activity commits × (1 + worstBranches + worstNesting/2).
 * Axes remain on each entry; this score is only for ordering.
 */
function combinedScore(activity: HotspotActivity, health: HotspotHealth | null): number {
  const complexity = health ? 1 + health.worstBranches + health.worstNesting / 2 : 1;
  return activity.commits * complexity;
}

function loadFileHealth(projectPath: string): Map<string, HotspotHealth> {
  const db = openDb(projectPath);
  try {
    const rows = db
      .prepare(
        `SELECT f.path AS path,
                COUNT(n.id) AS symbols,
                COALESCE(MAX(m.loc), 0) AS worst_loc,
                COALESCE(MAX(m.max_nesting), 0) AS worst_nesting,
                COALESCE(MAX(m.branches), 0) AS worst_branches
         FROM files f
         LEFT JOIN nodes n ON n.file_id = f.id
         LEFT JOIN node_metrics m ON m.node_id = n.id
         GROUP BY f.id`,
      )
      .all() as Array<{
      path: string;
      symbols: number;
      worst_loc: number;
      worst_nesting: number;
      worst_branches: number;
    }>;
    const map = new Map<string, HotspotHealth>();
    for (const r of rows) {
      map.set(r.path, {
        worstLoc: Number(r.worst_loc),
        worstNesting: Number(r.worst_nesting),
        worstBranches: Number(r.worst_branches),
        symbols: Number(r.symbols),
      });
    }
    return map;
  } finally {
    db.close();
  }
}

/**
 * Rank files by git activity × AST health for agent attention.
 *
 * @param projectPath - Project root with `.speclaw/index.db` and git history.
 * @param opts - Window, sort, and result limit.
 */
export function hotspots(
  projectPath: string,
  opts: {
    days?: number;
    since?: string;
    sortBy?: HotspotSortBy;
    limit?: number;
  } = {},
): HotspotsReport {
  const days = opts.days ?? DEFAULT_WINDOW_DAYS;
  const since = opts.since ?? sinceDaysAgo(days);
  const sortBy = opts.sortBy ?? "combined";
  const limit = opts.limit ?? 25;
  const warnings: string[] = [];

  const activity = cachedFileActivity(projectPath, { since });
  if (activity.shallow) {
    warnings.push("Repository is a shallow clone; history may be truncated.");
  }

  const healthByFile = loadFileHealth(projectPath);
  const entries: HotspotEntry[] = [];
  for (const [file, act] of activity.byPath) {
    if (act.commits <= 0) continue;
    const health = healthByFile.get(file) ?? null;
    entries.push({
      file,
      activity: {
        commits: act.commits,
        linesAdded: act.linesAdded,
        linesDeleted: act.linesDeleted,
        authors: act.authors,
      },
      health,
      combinedScore: combinedScore(act, health),
    });
  }

  const rank = (a: HotspotEntry, b: HotspotEntry): number => {
    if (sortBy === "churn") {
      return (
        b.activity.commits - a.activity.commits ||
        b.activity.linesAdded +
          b.activity.linesDeleted -
          (a.activity.linesAdded + a.activity.linesDeleted) ||
        a.file.localeCompare(b.file)
      );
    }
    if (sortBy === "complexity") {
      const bw = b.health?.worstBranches ?? -1;
      const aw = a.health?.worstBranches ?? -1;
      return (
        bw - aw ||
        (b.health?.worstNesting ?? -1) - (a.health?.worstNesting ?? -1) ||
        (b.health?.worstLoc ?? -1) - (a.health?.worstLoc ?? -1) ||
        a.file.localeCompare(b.file)
      );
    }
    return b.combinedScore - a.combinedScore || a.file.localeCompare(b.file);
  };
  entries.sort(rank);

  return {
    window: { days, since, label: `last ${days} days (since ${since})` },
    sortBy,
    hotspots: entries.slice(0, limit),
    diagnostics: {
      filesWithActivity: entries.length,
      indexedHealthFiles: [...healthByFile.keys()].length,
    },
    warnings,
  };
}

function fileMeta(
  projectPath: string,
  paths: string[],
): Map<string, { isTest: boolean; id: number }> {
  const db = openDb(projectPath);
  try {
    const map = new Map<string, { isTest: boolean; id: number }>();
    if (paths.length === 0) return map;
    const placeholders = paths.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT id, path, is_test FROM files WHERE path IN (${placeholders})`)
      .all(...paths) as Array<{ id: number; path: string; is_test: number }>;
    for (const r of rows) map.set(r.path, { isTest: r.is_test === 1, id: r.id });
    return map;
  } finally {
    db.close();
  }
}

/** True when any call/import edge links symbols in the two files (either direction). */
function pairInGraph(projectPath: string, a: string, b: string): boolean {
  const db = openDb(projectPath);
  try {
    const row = db
      .prepare(
        `SELECT 1 AS ok
         FROM edges e
         JOIN files sf ON sf.id = e.src_file_id
         JOIN nodes dn ON dn.id = e.dst_node_id
         JOIN files df ON df.id = dn.file_id
         WHERE e.kind IN ('call', 'import')
           AND ((sf.path = ? AND df.path = ?) OR (sf.path = ? AND df.path = ?))
         LIMIT 1`,
      )
      .get(a, b, b, a) as { ok: number } | undefined;
    if (row) return true;
    // Name-only imports: dst_node_id NULL — check import edge text contains other path basename loosely via file paths of same module is hard;
    // also match unresolved edges where dst resolves by file path of an indexed import target is out of scope.
    // Fallback: any edge from a whose dst_name matches a symbol defined in b (or reverse).
    const byName = db
      .prepare(
        `SELECT 1 AS ok
         FROM edges e
         JOIN files sf ON sf.id = e.src_file_id
         JOIN nodes dn ON dn.name = e.dst_name
         JOIN files df ON df.id = dn.file_id
         WHERE e.dst_node_id IS NULL
           AND e.kind IN ('call', 'import')
           AND ((sf.path = ? AND df.path = ?) OR (sf.path = ? AND df.path = ?))
         LIMIT 1`,
      )
      .get(a, b, b, a) as { ok: number } | undefined;
    return Boolean(byName);
  } finally {
    db.close();
  }
}

/**
 * Temporal coupling partners for a seed file, with graph contrast facts.
 */
export function coupling(
  projectPath: string,
  file: string,
  opts: {
    days?: number;
    since?: string;
    minShared?: number;
    maxFilesPerCommit?: number;
    limit?: number;
  } = {},
): CouplingReport {
  const days = opts.days ?? DEFAULT_WINDOW_DAYS;
  const since = opts.since ?? sinceDaysAgo(days);
  const minShared = opts.minShared ?? DEFAULT_MIN_SHARED;
  const maxFilesPerCommit = opts.maxFilesPerCommit ?? DEFAULT_MAX_FILES_PER_COMMIT;
  const limit = opts.limit ?? 25;
  const warnings: string[] = [];
  const rel = file.replace(/^\.\//, "");

  const co = cachedCoChanges(projectPath, {
    since,
    minSupport: minShared,
    maxFilesPerCommit,
  });
  if (co.shallow) {
    warnings.push("Repository is a shallow clone; history may be truncated.");
  }

  const activity = cachedFileActivity(projectPath, { since });
  const commitsSelf = activity.byPath.get(rel)?.commits ?? 0;

  const partnersRaw: Array<{ other: string; both: number }> = [];
  for (const p of co.pairs) {
    if (p.a === rel) partnersRaw.push({ other: p.b, both: p.count });
    else if (p.b === rel) partnersRaw.push({ other: p.a, both: p.count });
  }

  const paths = [rel, ...partnersRaw.map((p) => p.other)];
  const meta = fileMeta(projectPath, paths);
  const selfTest = meta.get(rel)?.isTest ?? false;

  const partners: CouplingPartner[] = partnersRaw
    .map(({ other, both }) => {
      const commitsOther = activity.byPath.get(other)?.commits ?? 0;
      const otherTest = meta.get(other)?.isTest ?? false;
      return {
        file: other,
        both,
        commitsSelf,
        commitsOther,
        strength: jaccardStrength(both, commitsSelf, commitsOther),
        inGraph: pairInGraph(projectPath, rel, other),
        isTestPair: selfTest !== otherTest && (selfTest || otherTest),
      };
    })
    .sort((a, b) => b.strength - a.strength || b.both - a.both || a.file.localeCompare(b.file))
    .slice(0, limit);

  return {
    file: rel,
    window: { days, since, label: `last ${days} days (since ${since})` },
    partners,
    diagnostics: {
      commitsScanned: co.commitsScanned ?? 0,
      skippedTooLarge: co.skippedTooLarge ?? 0,
      maxFilesPerCommit,
      minShared,
    },
    warnings,
  };
}
