/**
 * Change-directory resolution shared by the Cortex harness and its status
 * summary. A leaf module (no Cortex imports) so both can use it without an
 * import cycle; Cortex never imports the lawbook module.
 */
import fs from "node:fs";
import path from "node:path";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where a change lives: its active directory, or its newest archived one. */
export interface ResolvedChangeDir {
  /** Absolute path of the change directory. */
  dir: string;
  /** True when the change exists only under `lawbook/changes/archive/`. */
  archived: boolean;
}

/**
 * Resolve a change name to its directory: the active `lawbook/changes/<name>/`
 * when it exists, otherwise the newest `lawbook/changes/archive/<YYYY-MM-DD>-<name>/`
 * (matched exactly, so `<date>-other-<name>` never matches `<name>`).
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name.
 * @returns The directory and whether it is archived, or null when neither exists.
 */
// Covers: req~harness-archive-completes~1
export function resolveChangeDir(projectPath: string, change: string): ResolvedChangeDir | null {
  const active = path.join(projectPath, "lawbook", "changes", change);
  if (fs.existsSync(active)) return { dir: active, archived: false };
  const archiveRoot = path.join(projectPath, "lawbook", "changes", "archive");
  let entries: string[];
  try {
    entries = fs.readdirSync(archiveRoot);
  } catch {
    return null;
  }
  const re = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(change)}$`);
  const newest = entries
    .filter((e) => re.test(e))
    .sort()
    .at(-1);
  return newest ? { dir: path.join(archiveRoot, newest), archived: true } : null;
}
