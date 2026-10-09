/**
 * The scoped review handoff for the Cortex `reviewing` stage.
 *
 * An unscoped reviewer re-reads whole files (measured: 329 s, 63 tool calls);
 * one handed the diff as a file, told to start from `compass_diff_context`
 * and to check a fixed list of defect classes, finished in 66 s with every
 * finding still anchored to file:line. This module builds that handoff: it
 * exports the branch diff under `.speclaw/` (local, never committed) and
 * renders the prompt the coordinator pastes into the reviewer, agent-agnostic.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isGitRepo, mergeBase } from "../../shared/git.js";

/**
 * Defect classes every review checks, in order. The reviewer agent asset
 * lists the same classes (a unit test keeps the two in step).
 */
export const REVIEW_CHECKLIST: readonly string[] = [
  "Stub artifacts accepted as written: placeholder proposal/design/tasks/specs/reports (TODO, template text, empty sections, tasks checked with no matching code).",
  "Tests that touch the real checkout or real data: writes outside a temp dir, the repo's own tree, a real DB/store, live network.",
  "Missing discipline reports under reports/ — one per discipline touched; api.md whenever an endpoint or contract changes.",
  "Bug changes without red-first evidence: the regression test's failing output before the fix.",
  "New behavior without a test in the fitting layer, or a test weakened/deleted to pass.",
  "Suppressed gates: blanket ts-ignore, inline lint disables without a reason, lowered coverage floors.",
  "Violations of the docs/standards/* and path-scoped rules that govern the touched paths.",
];

/** Line ceiling for `reports/review.md`. */
export const REVIEW_MAX_LINES = 40;

/** What the reviewer is handed for one change. */
export interface ReviewHandoff {
  /** Project-relative path of the exported diff, or null when git cannot see a base. */
  diffPath: string | null;
  /** Merge-base SHA the diff is taken against, or null. */
  base: string | null;
  /** Project-relative paths the diff touches (tracked and untracked). */
  files: string[];
  /** Project-relative path the reviewer writes. */
  reportPath: string;
  /** Ready-to-paste reviewer prompt. */
  prompt: string;
}

/** Paths the review never needs: the local index and the exported diff itself. */
const EXCLUDES = [":(exclude).speclaw"];

function git(projectPath: string, args: string[]): string {
  const res = spawnSync("git", ["-C", projectPath, "-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return res.status === 0 || res.status === 1 ? (res.stdout ?? "") : "";
}

/**
 * Export the change's diff — committed since the merge base with `main`
 * (or `master`) plus uncommitted and untracked work — to
 * `.speclaw/review/<change>.diff`.
 *
 * @param projectPath - Absolute project root.
 * @param change - Change name.
 * @returns The diff path, base and files, or nulls when git has no base.
 */
export function exportReviewDiff(
  projectPath: string,
  change: string,
): { diffPath: string | null; base: string | null; files: string[] } {
  if (!isGitRepo(projectPath)) return { diffPath: null, base: null, files: [] };
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  if (!base) return { diffPath: null, base: null, files: [] };

  const tracked = git(projectPath, ["diff", base, "--", ".", ...EXCLUDES]);
  const trackedFiles = git(projectPath, ["diff", "--name-only", base, "--", ".", ...EXCLUDES])
    .split("\n")
    .filter(Boolean);
  const untracked = git(projectPath, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter((f) => f && !f.startsWith(".speclaw/"));
  // `--no-index` exits 1 when the files differ, which is the expected case.
  const added = untracked.map((f) => git(projectPath, ["diff", "--no-index", "/dev/null", f]));

  const rel = path.join(".speclaw", "review", `${change}.diff`);
  const abs = path.join(projectPath, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, [tracked, ...added].join(""));
  const files = [...new Set([...trackedFiles, ...untracked])].sort();
  return { diffPath: rel.split(path.sep).join("/"), base, files };
}

/**
 * Render the reviewer prompt: the scoped procedure, the defect checklist and
 * the fixed `review.md` format.
 *
 * @param change - Change name.
 * @param diffPath - Exported diff (project-relative), or null.
 * @param files - Files the diff touches.
 */
export function renderReviewPrompt(
  change: string,
  diffPath: string | null,
  files: readonly string[],
): string {
  const report = `lawbook/changes/${change}/reports/review.md`;
  const source = diffPath
    ? `The diff is exported to \`${diffPath}\` (${files.length} file(s)). Read it once; it is the scope.`
    : "No merge base was found: scope the review with `compass_diff_context` alone.";
  return [
    `Review change \`${change}\` as the Cortex reviewer. Scope is the diff, not the repo.`,
    "",
    "Procedure (aim for about 10 tool calls):",
    `1. ${source}`,
    "2. Call `compass_diff_context` once: touched symbols, blast radius, covering tests.",
    "3. Read only changed hunks and symbols — `compass_explore` a symbol when a hunk is not enough. Do not read whole files.",
    `4. Read the change's tasks, delta specs and reports/ list under \`lawbook/changes/${change}/\`.`,
    "5. Check every defect class below; verify each finding at file:line before recording it.",
    "",
    "Defect classes:",
    ...REVIEW_CHECKLIST.map((c) => `- ${c}`),
    "",
    `Write \`${report}\` in at most ${REVIEW_MAX_LINES} lines:`,
    "```",
    `# Review: ${change}`,
    "Verdict: PASS | FAIL",
    "## Blocking",
    "- path/to/file.ts:42 — defect, why it blocks, the fix (or `none`)",
    "## Non-blocking",
    "- path:line — one line each (or `none`)",
    "```",
    "FAIL only on a blocking finding. Do not patch code; return the verdict to the coordinator.",
  ].join("\n");
}

/**
 * Build the reviewer handoff for `change`: export the diff, then render the prompt.
 *
 * @param projectPath - Absolute project root.
 * @param change - Change name.
 */
export function buildReviewHandoff(projectPath: string, change: string): ReviewHandoff {
  const { diffPath, base, files } = exportReviewDiff(projectPath, change);
  return {
    diffPath,
    base,
    files,
    reportPath: `lawbook/changes/${change}/reports/review.md`,
    prompt: renderReviewPrompt(change, diffPath, files),
  };
}
