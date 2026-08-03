import fs from "node:fs";
import path from "node:path";
import { render } from "./render.js";

/** Accumulated record of filesystem changes made during an install/configure run. */
export interface InstallReport {
  /** Paths that were created or written. */
  written: string[];
  /** Paths left untouched because they already existed. */
  skipped: string[];
  /** Symlinks created, formatted as `link -> target`. */
  symlinks: string[];
  /** Placeholder names that had no value while rendering templates. */
  unresolvedVars: string[];
}

/** Create a fresh, empty {@link InstallReport} to accumulate results into. */
export function emptyReport(): InstallReport {
  return { written: [], skipped: [], symlinks: [], unresolvedVars: [] };
}

/**
 * Recursively copy a source tree into a destination, rendering {{var}}
 * placeholders in .md/.mdc files and copying everything else verbatim. Existing
 * destination files are never overwritten (recorded as skipped).
 *
 * @param srcDir - Source directory tree to copy from.
 * @param destDir - Destination directory (created if missing).
 * @param vars - Placeholder values used to render `.md`/`.mdc` files.
 * @param report - Report mutated in place with written, skipped, and unresolved-var entries.
 */
export function copyRendered(
  srcDir: string,
  destDir: string,
  vars: Record<string, string | undefined>,
  report: InstallReport,
): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyRendered(src, dest, vars, report);
      continue;
    }
    if (fs.existsSync(dest)) {
      report.skipped.push(dest);
      continue;
    }
    if (entry.name.endsWith(".md") || entry.name.endsWith(".mdc")) {
      const { output, unresolved } = render(fs.readFileSync(src, "utf8"), vars);
      unresolved.forEach((v) => {
        if (!report.unresolvedVars.includes(v)) report.unresolvedVars.push(v);
      });
      fs.writeFileSync(dest, output);
    } else {
      fs.copyFileSync(src, dest);
    }
    report.written.push(dest);
  }
}

/**
 * Append an entry to the project's .gitignore if not already present.
 *
 * @param projectPath - Project root containing (or receiving) the `.gitignore`.
 * @param entry - The ignore pattern to ensure is present.
 * @param comment - Comment line written above the entry when it is added.
 * @param report - Report mutated in place; the appended entry is recorded under `written`.
 */
export function ensureGitignore(
  projectPath: string,
  entry: string,
  comment: string,
  report: InstallReport,
): void {
  const gitignorePath = path.join(projectPath, ".gitignore");
  let content = "";
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf8");
    if (content.split(/\r?\n/).some((l) => l.trim() === entry)) return;
    if (!content.endsWith("\n")) content += "\n";
  }
  content += `\n# ${comment}\n${entry}\n`;
  fs.writeFileSync(gitignorePath, content);
  report.written.push(`${gitignorePath} (${entry})`);
}
