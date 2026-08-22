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
  /**
   * SHA-256 of the content speclaw last wrote for each managed file, keyed by
   * project-relative path. Lets `speclaw update` tell "unchanged since we wrote
   * it" (safe to overwrite silently) from "the user edited it" (back up first).
   */
  baselines: Record<string, string>;
  /**
   * When true, the MCP server omits setup/lifecycle tools (minimal exposure).
   * Persists across `update` unless explicitly changed.
   */
  minimal?: boolean;
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
      baselines:
        m.baselines && typeof m.baselines === "object"
          ? (m.baselines as Record<string, string>)
          : {},
      minimal: Boolean(m.minimal),
    };
  } catch {
    return null;
  }
}

export interface WriteManifestOpts {
  /** When set, updates the minimal flag; when omitted, preserves the previous value. */
  minimal?: boolean;
}

/**
 * Write (or refresh) a project's manifest, recording the current version and the
 * union of previously-installed and newly-installed packs.
 *
 * @param projectPath - Project root to write into.
 * @param version - The speclaw version doing the write.
 * @param packs - Pack names installed in this run.
 * @param baselines - Managed-file hashes to merge over the recorded ones.
 * @param opts - Optional `minimal` flag; omitted keeps the prior value (default false).
 */
export function writeManifest(
  projectPath: string,
  version: string,
  packs: string[],
  baselines: Record<string, string> = {},
  opts: WriteManifestOpts = {},
): void {
  const prev = readManifest(projectPath);
  const merged = Array.from(new Set([...(prev?.packs ?? []), ...packs]));
  const mergedBaselines = { ...(prev?.baselines ?? {}), ...baselines };
  const minimal = opts.minimal !== undefined ? opts.minimal : (prev?.minimal ?? false);
  const p = manifestPath(projectPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body: Manifest = {
    version,
    packs: merged,
    baselines: mergedBaselines,
    ...(minimal ? { minimal: true } : {}),
  };
  fs.writeFileSync(p, JSON.stringify(body, null, 2) + "\n");
}
