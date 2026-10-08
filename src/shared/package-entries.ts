import fs from "node:fs";
import path from "node:path";

/** One entry point a package publishes, as `package.json` declares it. */
export interface PackageEntry {
  /** Source file when one mirrors the built entry (`dist/x.js` → `src/x.ts`), else the declared path. */
  file: string;
  /** Which field declared it: `main`, or `bin` (with the command name when there are several). */
  kind: string;
}

/**
 * The entry points the root `package.json` declares in `main` and `bin`. A
 * built path is mapped back to the source file that produces it when that
 * file exists, so the entries name code the agent edits. A repo without a
 * root package, or one that declares neither field (an app or a workspace
 * root), has none.
 *
 * @param projectPath - Project root.
 * @returns The declared entries, deduplicated by file; empty when none.
 */
export function packageEntries(projectPath: string): PackageEntry[] {
  let pkg: { main?: unknown; bin?: unknown };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8")) as typeof pkg;
  } catch {
    return [];
  }
  const declared: PackageEntry[] = [];
  if (typeof pkg.main === "string") declared.push({ file: pkg.main, kind: "main" });
  if (typeof pkg.bin === "string") declared.push({ file: pkg.bin, kind: "bin" });
  else if (pkg.bin && typeof pkg.bin === "object") {
    const bins = Object.entries(pkg.bin as Record<string, unknown>);
    for (const [name, file] of bins) {
      if (typeof file === "string") {
        declared.push({ file, kind: bins.length > 1 ? `bin ${name}` : "bin" });
      }
    }
  }
  const seen = new Set<string>();
  const out: PackageEntry[] = [];
  for (const e of declared) {
    const file = sourceOf(projectPath, e.file.replace(/^\.\//, ""));
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({ file, kind: e.kind });
  }
  return out;
}

/** `dist/cli/index.js` → `src/cli/index.ts` when that source exists, else the path unchanged. */
function sourceOf(projectPath: string, file: string): string {
  const m = /^(?:dist|build|lib|out)\/(.+)\.[cm]?js$/.exec(file);
  if (!m) return file;
  for (const ext of [".ts", ".tsx", ".mts", ".js", ".mjs"]) {
    const candidate = `src/${m[1]}${ext}`;
    if (fs.existsSync(path.join(projectPath, candidate))) return candidate;
  }
  return file;
}
