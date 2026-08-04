import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Flags } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";
import { checkForUpdates, isNewer } from "../lib/update-check.js";
import { pkgName, pkgVersion } from "../../shared/version.js";
import { scaffold } from "../../modules/foundation/scaffold.js";
import { PERSONALIZED } from "../../modules/foundation/ownership.js";
import { detectConfiguredAgents } from "../../shared/agents.js";
import { readManifest } from "../../shared/manifest.js";
import { loadPacks } from "../../modules/tools/packs.js";
import { InstallReport } from "../../shared/install.js";
import { detectProjectName } from "./init.js";

/**
 * A feature migration: a step a release needs beyond dropping new files (which
 * the additive re-scaffold already handles). Runs only when the project was last
 * scaffolded with a version older than `version`. Add entries here as releases
 * introduce steps; keep each one idempotent.
 */
interface Migration {
  version: string;
  describe: string;
  /** Optional programmatic step (beyond dropping/refreshing files). */
  run?: (projectPath: string, report: InstallReport) => void;
  /**
   * Optional instructions for the user's agent to apply this release's changes to
   * PERSONALIZED files (CLAUDE.md, AGENTS.md, LAWS.md, docs/standards,
   * config.yaml). Collected across crossed versions and printed as one prompt —
   * these files hold project specifics, so update never edits them directly.
   */
  agentPrompt?: string;
}
// The first migration must be tagged at the version that introduces this
// mechanism (0.1.12): `isNewer` is strict, so an entry tagged at an already-
// shipped version (e.g. 0.1.11) would never fire for projects already on it.
const MIGRATIONS: Migration[] = [
  {
    version: "0.1.12",
    describe: "Compass-first rule + reports mandatory step in personalized files",
    agentPrompt:
      "- In CLAUDE.md and AGENTS.md, change the Compass rule to 'Compass first, always': " +
      "call Compass (compass_explore/search/recall) before grep/sed/cat/Read for any code " +
      "question — including files you already know by name — and fall back to manual file " +
      "tools only after a Compass call returns nothing useful, the graph is missing, or the " +
      "target isn't indexed code (CSS/JSON/logs). Update the matching Compass row in LAWS.md " +
      "and the intro of docs/compass.md the same way.\n" +
      "- In lawbook/config.yaml, add this mandatory task step before the docs/archive steps: " +
      '"Produce the discipline reports under reports/ (unit/integration/e2e results for what ' +
      'the feature touched)."\n' +
      "- Preserve all project-specific wording; only apply these speclaw-authored changes.",
  },
];

/**
 * Update speclaw and bring the current project up to date without a full re-init:
 * upgrade the global package, then additively apply any new standards, skills,
 * commands, and feature steps this project is missing (existing files untouched).
 *
 * @param flags - `--check` reports without changing anything; `--migrate-only`
 *   skips the global upgrade and only applies project changes (used internally
 *   after the package is upgraded, so migrations run from the new version).
 */
export async function runUpdate(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const migrateOnly = Boolean(flags["migrate-only"]);
  const checkOnly = Boolean(flags.check);
  const winShell = process.platform === "win32";

  if (!migrateOnly) {
    ui.step("Checking for updates");
    const { current, latest, updateAvailable } = await checkForUpdates({ force: true });

    if (!latest) {
      ui.warn("Could not reach the npm registry — skipping the version check.");
    } else if (updateAvailable) {
      ui.info(`${c.muted(current)} ${c.muted("→")} ${c.cyan(latest)}`);
      if (checkOnly) {
        ui.info(`Run ${ui.code("speclaw update")} to upgrade and apply what's new.`);
        return;
      }
      ui.step(`Updating ${pkgName()} globally`);
      const install = spawnSync("npm", ["install", "-g", `${pkgName()}@latest`], {
        stdio: "inherit",
        shell: winShell,
      });
      if (install.status !== 0) {
        ui.err(
          "Global update failed. Try again with elevated permissions (e.g. sudo), or check your npm setup.",
        );
        process.exit(1);
      }
      ui.ok(`Updated to ${latest}`);

      // Re-exec the NEWLY installed binary so migrations run with the new assets
      // and any new feature steps — not this (now-stale) process.
      const re = spawnSync("speclaw", ["update", "--migrate-only"], {
        stdio: "inherit",
        shell: winShell,
      });
      if (re.error) {
        ui.warn(
          `Upgraded — now run ${ui.code("speclaw update --migrate-only")} to apply project changes.`,
        );
        return;
      }
      process.exit(re.status ?? 0);
    } else {
      ui.ok(`Already on the latest version (${current}).`);
      if (checkOnly) return;
    }
  }

  applyProjectMigrations(cwd);
}

/**
 * Additively apply the current version's content and feature steps to a project.
 * No-op with a hint when the directory isn't a speclaw project.
 */
function applyProjectMigrations(cwd: string): void {
  const initialized =
    fs.existsSync(path.join(cwd, "ai-specs")) || fs.existsSync(path.join(cwd, "LAWS.md"));
  if (!initialized) {
    ui.step("Project");
    ui.info(`No speclaw project here — run ${ui.code("speclaw init")} to set one up.`);
    return;
  }

  ui.step("Applying what's new to this project");
  const fromVersion = readManifest(cwd)?.version ?? "0.0.0";
  const agents = detectConfiguredAgents(cwd);
  const known = loadPacks();
  const packs = (readManifest(cwd)?.packs ?? []).filter((p) => p in known);

  // Managed files (skills/commands/rules/agents) are refreshed to the current
  // version; personalized files (constitution/standards/config) are never
  // rewritten — those changes are handed to the user's agent below.
  const report = scaffold(cwd, { project_name: detectProjectName(cwd) }, packs, agents, {
    refreshManaged: true,
  });

  const changed = report.written.filter((w) => !w.includes(".gitignore"));
  if (changed.length) {
    for (const w of changed) ui.ok(c.cream(path.relative(cwd, w)));
    ui.info(`${changed.length} file(s) added/refreshed · ${report.skipped.length} left untouched.`);
  } else {
    ui.ok("Managed content already up to date — nothing to refresh.");
  }
  for (const b of report.backedUp) {
    const rel = path.relative(cwd, b);
    ui.warn(`${c.cream(rel)} had local edits — saved as ${rel}.bak before refreshing.`);
  }

  // A project several releases behind jumps straight to @latest, so apply EVERY
  // migration newer than its recorded version — not just the next one — oldest
  // first (sorted, so array order can't matter). Entries are cumulative: never
  // delete a shipped migration, or a laggard crossing it later would miss it.
  const pending = MIGRATIONS.filter((m) => isNewer(m.version, fromVersion)).sort((a, b) =>
    isNewer(a.version, b.version) ? 1 : isNewer(b.version, a.version) ? -1 : 0,
  );
  for (const m of pending) {
    if (!m.run) continue;
    ui.step(`Step for ${m.version}: ${m.describe}`);
    m.run(cwd, report);
  }

  // Personalized files can't be auto-edited (they hold project specifics), so
  // hand their changes to whatever agent the user runs — never a hardcoded one.
  const prompt = pending
    .map((m) => m.agentPrompt)
    .filter(Boolean)
    .join("\n");
  if (prompt) {
    ui.plain();
    ui.step("One step for the agent you're using");
    ui.info(
      `Personalized files (${PERSONALIZED.join(", ")}) hold your project specifics, so ` +
        `speclaw won't edit them. Paste this into the agent you're using to apply this ` +
        `release's changes while keeping your content:`,
    );
    ui.plain();
    console.log(c.cream(prompt));
    ui.plain();
  }

  ui.plain();
  ui.ok(`On ${c.cyan(pkgVersion())}. No re-init needed.`);
}
