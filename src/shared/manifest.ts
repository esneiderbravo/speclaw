import fs from "node:fs";
import path from "node:path";

// A tiny, committed record of what speclaw installed into a project, written to
// ai-specs/.speclaw.json. It lets `speclaw update` re-apply only the packs the
// project actually chose (additively) and gate feature migrations by the version
// the project was last scaffolded with — without a full re-init.

/** What speclaw last wrote into a project. */
export interface Manifest {
  /** The speclaw version this project was last scaffolded/updated with. */
  version: string;
  /** Tool packs installed in this project. */
  packs: string[];
}

function manifestPath(projectPath: string): string {
  return path.join(projectPath, "ai-specs", ".speclaw.json");
}

/**
 * Read a project's speclaw manifest.
 *
 * @param projectPath - Project root to read from.
 * @returns The manifest, or null if the project has none (e.g. an older init).
 */
export function readManifest(projectPath: string): Manifest | null {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));
    return {
      version: String(m.version ?? "0.0.0"),
      packs: Array.isArray(m.packs) ? m.packs.map(String) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Write (or refresh) a project's manifest, recording the current version and the
 * union of previously-installed and newly-installed packs.
 *
 * @param projectPath - Project root to write into.
 * @param version - The speclaw version doing the write.
 * @param packs - Pack names installed in this run.
 */
export function writeManifest(projectPath: string, version: string, packs: string[]): void {
  const prev = readManifest(projectPath);
  const merged = Array.from(new Set([...(prev?.packs ?? []), ...packs]));
  const p = manifestPath(projectPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version, packs: merged }, null, 2) + "\n");
}
