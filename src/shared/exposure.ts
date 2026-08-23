import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "./manifest.js";

/**
 * Tools omitted when the exposure profile is `minimal`. Kept tools are the
 * discovery + law loop: compass_explore/search/recall, lawbook_validate/sync,
 * lawbook_coverage, lawbook_drift, law_verify, speclaw_check.
 */
export const MINIMAL_OMIT = new Set<string>([
  "compass_index",
  "compass_watch",
  "compass_impact",
  "compass_affected_tests",
  "compass_hotspots",
  "compass_coupling",
  "compass_trace",
  "compass_visualize",
  "lawbook_init",
  "lawbook_archive",
  "lawbook_list",
  "lawbook_level",
  "lawbook_investigate",
  "init_project",
  "scaffold",
  "configure_agent",
  "doctor",
  "add_pack",
  "list_packs",
]);

/** Options passed to each module's register function. */
export interface RegisterOpts {
  /** When true, skip tools in {@link MINIMAL_OMIT}. */
  minimal?: boolean;
}

/**
 * Whether minimal exposure is active for this process / project.
 * `SPECLAW_MINIMAL=1` wins; otherwise the project manifest's `minimal` flag.
 *
 * @param cwd - Project root to read the manifest from (default `process.cwd()`).
 */
export function isMinimalMode(cwd: string = process.cwd()): boolean {
  if (process.env.SPECLAW_MINIMAL === "1") return true;
  return Boolean(readManifest(cwd)?.minimal);
}

/**
 * Whether a tool name should be registered under the given profile.
 *
 * @param name - MCP tool name.
 * @param minimal - Active exposure profile.
 */
export function shouldExpose(name: string, minimal: boolean): boolean {
  return !(minimal && MINIMAL_OMIT.has(name));
}

/** Declared ceilings loaded from `token-budget.json`. */
export interface DeclaredBudget {
  schemaVersion: number;
  estimator: string;
  surfaces: {
    tools: number;
    skillsAndCommands: number;
    alwaysOnInstructions: number;
  };
  total: number;
  perTool: number;
  maxDescriptionWords: number;
  dispatcher: number;
  map: number;
  minimal: {
    tools: number;
    total: number;
  };
  note?: string;
}

const DEFAULT_BUDGET: DeclaredBudget = {
  schemaVersion: 1,
  estimator: "speclaw/estimate-v1",
  surfaces: {
    tools: 12000,
    skillsAndCommands: 4000,
    alwaysOnInstructions: 8000,
  },
  total: 24000,
  perTool: 800,
  maxDescriptionWords: 25,
  dispatcher: 400,
  map: 300,
  minimal: { tools: 4500, total: 12000 },
  note: "Placeholder ceilings — replaced after the first post-rewrite measurement.",
};

/**
 * Resolve the directory that holds speclaw's package root (where
 * `token-budget.json` lives when developing or when shipped next to package.json).
 */
export function packageRoot(): string {
  // Walk up from this module: src/shared, dist/shared, or dist-test/src/shared.
  // Prefer a directory that actually contains token-budget.json — dist-test also
  // has package.json with this package's name, so name-matching alone is wrong.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  let named: string | null = null;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "token-budget.json"))) return dir;
    const pkg = path.join(dir, "package.json");
    if (!named && fs.existsSync(pkg)) {
      try {
        const name = (JSON.parse(fs.readFileSync(pkg, "utf8")) as { name?: string }).name;
        if (name === "@esneiderbravo/speclaw") named = dir;
      } catch {
        /* continue */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (named) return named;
  return process.cwd();
}

/**
 * Load declared budget ceilings. Missing file → embedded defaults (tests may
 * still override via the committed file once written).
 *
 * @param root - Directory containing `token-budget.json`.
 */
export function loadDeclaredBudget(root: string = packageRoot()): DeclaredBudget {
  const p = path.join(root, "token-budget.json");
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as DeclaredBudget;
    return { ...DEFAULT_BUDGET, ...raw, surfaces: { ...DEFAULT_BUDGET.surfaces, ...raw.surfaces } };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}
