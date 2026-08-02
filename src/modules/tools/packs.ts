import fs from "node:fs";
import path from "node:path";
import { assetsDir } from "../../shared/paths.js";
import { copyRendered, InstallReport } from "../../shared/install.js";

const ASSETS = assetsDir(import.meta.url);

/** Manifest entry for one installable tool pack. */
export interface PackDef {
  description: string;
  /** Pack directory name under assets/packs/. */
  path: string;
  /** Dependency hints; when matched in a repo, the pack is suggested. */
  detect?: string[];
}

/**
 * Load the tool-pack manifest from assets/packs.json.
 *
 * @returns A map of pack name to its {@link PackDef}.
 */
export function loadPacks(): Record<string, PackDef> {
  const raw = fs.readFileSync(path.join(ASSETS, "packs.json"), "utf8");
  return JSON.parse(raw) as Record<string, PackDef>;
}

/**
 * Install a pack's assets into a project's ai-specs/. A pack contains either
 * subdirectories (skills/, commands/, rules/) mapped to ai-specs/<sub>, or
 * loose agent .md files at its root mapped to ai-specs/agents/.
 *
 * @param projectPath - Absolute path to the project root.
 * @param name - Pack name to install (key in the manifest).
 * @param vars - Template variables applied while copying the pack's assets.
 * @param report - Mutated in place with the copy results.
 * @throws If no pack with the given name exists in the manifest.
 */
export function installPack(
  projectPath: string,
  name: string,
  vars: Record<string, string | undefined>,
  report: InstallReport
): void {
  const packs = loadPacks();
  const def = packs[name];
  if (!def) {
    throw new Error(`Unknown pack "${name}". Available: ${Object.keys(packs).join(", ")}`);
  }
  const packRoot = path.join(ASSETS, "packs", def.path);
  const aiSpecs = path.join(projectPath, "ai-specs");
  for (const sub of fs.readdirSync(packRoot, { withFileTypes: true })) {
    if (sub.isDirectory()) {
      copyRendered(path.join(packRoot, sub.name), path.join(aiSpecs, sub.name), vars, report);
    } else if (sub.name.endsWith(".md")) {
      // loose .md at pack root = agent definitions
      copyRendered(packRoot, path.join(aiSpecs, "agents"), vars, report);
      break;
    }
  }
}
