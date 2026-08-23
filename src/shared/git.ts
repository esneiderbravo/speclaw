import { spawnSync } from "node:child_process";

/**
 * True when `projectPath` is inside a git working tree.
 *
 * Best-effort: shells `git rev-parse --is-inside-work-tree` and treats any
 * failure (git not installed, not a repository) as "not a repo" rather than
 * throwing — callers use this only to decide whether to attempt further git
 * queries.
 *
 * @param projectPath - Directory to test.
 * @returns `true` only when git reports the path is inside a work tree.
 */
export function isGitRepo(projectPath: string): boolean {
  const res = spawnSync("git", ["-C", projectPath, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
  });
  return res.status === 0 && res.stdout.trim() === "true";
}

/**
 * Of `candidates` (project-relative paths), the subset git currently tracks.
 *
 * Adding a path to `.gitignore` does not stop git tracking a file it already
 * tracks; this reports which speclaw paths are still tracked so a command can
 * tell the user how to untrack them. Returns an empty array when `projectPath`
 * is not a git repository (or git is unavailable).
 *
 * @param projectPath - Project root to query.
 * @param candidates - Project-relative paths (files, directories, or symlinks).
 * @returns The candidates for which `git ls-files` reports at least one tracked
 *   entry, in the order given.
 */
export function listTrackedPaths(projectPath: string, candidates: string[]): string[] {
  if (!isGitRepo(projectPath)) return [];
  return candidates.filter((rel) => {
    const res = spawnSync("git", ["-C", projectPath, "ls-files", "--", rel], { encoding: "utf8" });
    return res.status === 0 && res.stdout.trim().length > 0;
  });
}

/**
 * The merge-base SHA of `ref` and `HEAD`, or `null` when the repo is missing,
 * shallow, or `ref` is unknown. Callers that need a PR diff must treat `null`
 * as "cannot see the base" — never as "nothing changed".
 *
 * @param projectPath - Directory inside the work tree.
 * @param ref - The other end of the range (e.g. `origin/main`, a SHA).
 */
export function mergeBase(projectPath: string, ref: string): string | null {
  if (!isGitRepo(projectPath)) return null;
  const res = spawnSync("git", ["-C", projectPath, "merge-base", ref, "HEAD"], {
    encoding: "utf8",
  });
  if (res.status !== 0) return null;
  const sha = res.stdout.trim();
  return sha || null;
}

/**
 * Project-relative paths changed between `base` and `HEAD` (added, copied,
 * modified, renamed). Uses `merge-base` so merge commits in the range are not
 * counted as the PR's own work. Returns `[]` when the merge base cannot be
 * resolved — callers in CI must fail that case rather than treat it as clean.
 *
 * @param projectPath - Directory inside the work tree.
 * @param base - The other end of the range (branch name or SHA).
 */
export function changedFiles(projectPath: string, base: string): string[] {
  const mb = mergeBase(projectPath, base);
  if (!mb) return [];
  const res = spawnSync(
    "git",
    [
      "-C",
      projectPath,
      "-c",
      "core.quotePath=false",
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      `${mb}...HEAD`,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0 || typeof res.stdout !== "string") return [];
  return res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Project-relative paths with uncommitted changes vs `HEAD` (staged and unstaged).
 *
 * @param projectPath - Directory inside the work tree.
 */
export function worktreeChangedFiles(projectPath: string): string[] {
  if (!isGitRepo(projectPath)) return [];
  const res = spawnSync(
    "git",
    [
      "-C",
      projectPath,
      "-c",
      "core.quotePath=false",
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "HEAD",
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0 || typeof res.stdout !== "string") return [];
  return res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
