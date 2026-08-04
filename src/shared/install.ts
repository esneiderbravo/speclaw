import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { render } from "./render.js";

/** Accumulated record of filesystem changes made during an install/configure run. */
export interface InstallReport {
  /** Paths that were created or written. */
  written: string[];
  /** Paths left untouched because they already existed. */
  skipped: string[];
  /** Managed paths whose local edits were saved to `<file>.bak` before overwrite. */
  backedUp: string[];
  /** Symlinks created, formatted as `link -> target`. */
  symlinks: string[];
  /** Placeholder names that had no value while rendering templates. */
  unresolvedVars: string[];
}

/** Create a fresh, empty {@link InstallReport} to accumulate results into. */
export function emptyReport(): InstallReport {
  return { written: [], skipped: [], backedUp: [], symlinks: [], unresolvedVars: [] };
}

/** SHA-256 of a file's intended content, used to track managed-file baselines. */
export function sha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Options controlling how {@link copyRendered} treats existing destinations. */
export interface CopyOpts {
  /**
   * Overwrite existing files instead of skipping them (managed refresh). A file
   * whose current content matches its recorded baseline is overwritten silently;
   * one that diverged is copied to `<file>.bak` first. Default false = additive.
   */
  overwrite?: boolean;
  /** Project root, used to key baselines by project-relative path. */
  projectPath?: string;
  /** Recorded baselines (relPath -> sha) from the manifest. */
  baselines?: Record<string, string>;
  /** Collects the baseline (relPath -> sha) of every file written this run. */
  record?: Record<string, string>;
}

/**
 * Recursively copy a source tree into a destination, rendering {{var}}
 * placeholders in .md/.mdc files and copying everything else verbatim. Existing
 * destination files are never overwritten (recorded as skipped).
 *
 * @param srcDir - Source directory tree to copy from.
 * @param destDir - Destination directory (created if missing).
 * @param vars - Placeholder values used to render `.md`/`.mdc` files.
 * @param report - Report mutated in place with written, skipped, backed-up, and
 *   unresolved-var entries.
 * @param opts - Overwrite/baseline behavior; omitted means additive (skip existing).
 */
export function copyRendered(
  srcDir: string,
  destDir: string,
  vars: Record<string, string | undefined>,
  report: InstallReport,
  opts?: CopyOpts,
): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyRendered(src, dest, vars, report, opts);
      continue;
    }

    // Compute the content speclaw wants at dest (rendered for md/mdc, raw otherwise).
    let content: string | Buffer;
    if (entry.name.endsWith(".md") || entry.name.endsWith(".mdc")) {
      const { output, unresolved } = render(fs.readFileSync(src, "utf8"), vars);
      unresolved.forEach((v) => {
        if (!report.unresolvedVars.includes(v)) report.unresolvedVars.push(v);
      });
      content = output;
    } else {
      content = fs.readFileSync(src);
    }

    const rel = opts?.projectPath ? path.relative(opts.projectPath, dest) : dest;
    const newSha = sha256(content);

    if (fs.existsSync(dest)) {
      if (!opts?.overwrite) {
        report.skipped.push(dest);
        continue;
      }
      const current = fs.readFileSync(dest);
      if (sha256(current) === newSha) {
        // Already the current version — nothing to write, but keep the baseline.
        if (opts.record) opts.record[rel] = newSha;
        continue;
      }
      const baseline = opts.baselines?.[rel];
      if (!baseline || sha256(current) !== baseline) {
        // Diverged from what we last wrote (or unknown) — preserve the user's copy.
        fs.copyFileSync(dest, dest + ".bak");
        report.backedUp.push(dest);
      }
      fs.writeFileSync(dest, content);
    } else {
      fs.writeFileSync(dest, content);
    }

    report.written.push(dest);
    if (opts?.record) opts.record[rel] = newSha;
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
