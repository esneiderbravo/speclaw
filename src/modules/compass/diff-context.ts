import { isGitRepo, changedFiles, worktreeChangedFiles } from "../../shared/git.js";
import { openDb, indexExists } from "./db.js";
import { impact } from "./query.js";
import { affectedTests, type AffectedTestsResult } from "./affected.js";
import { hotspots, type HotspotEntry } from "./hotspots.js";
import { summarizeImpact, type BlastRadiusSummary } from "./impact-summary.js";
import {
  applyTextBudget,
  type OutputMode,
  type TruncationEntry,
} from "../../shared/output-budget.js";

export interface DiffContextQuery {
  projectPath: string;
  rev?: string;
  paths?: string[];
  mode?: OutputMode;
  maxDepth?: number;
}

export interface DiffContextResult {
  changedFiles: string[];
  changedSymbols: Array<{ name: string; kind: string; file: string; line: number }>;
  blastRadius?: BlastRadiusSummary;
  affectedTests?: Pick<AffectedTestsResult, "tests" | "command" | "mode" | "reason">;
  hotspotsTouched?: Array<Pick<HotspotEntry, "file" | "combinedScore">>;
  truncated?: TruncationEntry[];
  message?: string;
}

function listWorktreeChanges(projectPath: string): string[] {
  const wt = worktreeChangedFiles(projectPath);
  if (wt.length > 0) return wt;
  for (const base of ["main", "master"]) {
    const files = changedFiles(projectPath, base);
    if (files.length > 0) return files;
  }
  return [];
}

function symbolsForFiles(
  projectPath: string,
  files: string[],
  overestimate: boolean,
): DiffContextResult["changedSymbols"] {
  if (!indexExists(projectPath)) return [];
  const db = openDb(projectPath);
  try {
    const out: DiffContextResult["changedSymbols"] = [];
    for (const file of files) {
      const nodes = db
        .prepare(
          `SELECT n.name, n.kind, n.start_line AS line, f.path AS file
           FROM nodes n JOIN files f ON f.id = n.file_id
           WHERE f.path = ?`,
        )
        .all(file) as Array<{ name: string; kind: string; line: number; file: string }>;
      if (overestimate || nodes.length === 0) {
        for (const n of nodes) out.push(n);
      } else {
        for (const n of nodes) out.push(n);
      }
    }
    return out;
  } finally {
    db.close();
  }
}

/**
 * Graph context for a set of changed files (git rev, working tree, or explicit paths).
 *
 * @param query - Diff scope and output mode.
 */
export function diffContext(query: DiffContextQuery): DiffContextResult {
  const mode = query.mode ?? "brief";
  const truncated: TruncationEntry[] = [];
  let files = [...(query.paths ?? [])];
  let message: string | undefined;

  if (files.length === 0) {
    if (!isGitRepo(query.projectPath)) {
      throw new Error("not a git repository — pass `paths` explicitly to compass_diff_context");
    }
    files =
      query.rev && query.rev !== "WORKTREE"
        ? changedFiles(query.projectPath, query.rev)
        : listWorktreeChanges(query.projectPath);
  }

  if (files.length === 0) {
    return {
      changedFiles: [],
      changedSymbols: [],
      message: "no changed files in scope",
      truncated,
    };
  }

  if (files.length > 50) {
    message = `diff touches ${files.length} files — returning aggregated blast radius only; pass paths to narrow`;
    files = files.slice(0, 50);
  }

  const overestimate = Boolean(query.paths?.length && !query.rev);
  if (overestimate) {
    message = "symbol set is an overestimate (paths without hunks — all nodes in those files)";
  }

  const changedSymbols = symbolsForFiles(query.projectPath, files, overestimate);
  const result: DiffContextResult = { changedFiles: files, changedSymbols, truncated, message };

  try {
    const imp = impact(query.projectPath, {
      files,
      maxDepth: query.maxDepth ?? 4,
      format: "grouped",
    });
    result.blastRadius = summarizeImpact(imp);
  } catch {
    /* no index */
  }

  try {
    const at = affectedTests(query.projectPath, {
      files,
      fromDiff: query.rev === "WORKTREE" || !query.rev ? "WORKTREE" : query.rev,
      maxDepth: query.maxDepth ?? 6,
    });
    result.affectedTests = {
      tests: at.tests,
      command: at.command,
      mode: at.mode,
      reason: at.reason,
    };
  } catch {
    /* degrade */
  }

  try {
    const hs = hotspots(query.projectPath, { sortBy: "combined", limit: 200 });
    const touched = hs.hotspots.filter((h) => files.includes(h.file));
    result.hotspotsTouched = touched.slice(0, 10).map((h) => ({
      file: h.file,
      combinedScore: h.combinedScore,
    }));
  } catch {
    /* degrade */
  }

  const json = applyTextBudget(JSON.stringify(result, null, 2), mode);
  if (json.truncated) {
    truncated.push({
      field: "response",
      omitted: json.omittedChars,
      hint: 'use mode:"full" or pass explicit paths',
    });
  }

  return result;
}

/** Format diff context with output budget. */
export function formatDiffContext(result: DiffContextResult, mode: OutputMode = "brief"): string {
  return applyTextBudget(JSON.stringify(result, null, 2), mode).text;
}
