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
