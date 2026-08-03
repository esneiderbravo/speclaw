import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Flags } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";
import { checkForUpdates, isNewer } from "../lib/update-check.js";
import { pkgName, pkgVersion } from "../../shared/version.js";
import { scaffold } from "../../modules/foundation/scaffold.js";
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
  run: (projectPath: string, report: InstallReport) => void;
}
const MIGRATIONS: Migration[] = [
  // e.g. { version: "0.3.0", describe: "…", run: (p, r) => { … } }
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

  // scaffold is non-destructive: only missing files are written, and it refreshes
  // the manifest to the current version. Existing files are left exactly as-is.
  const report = scaffold(cwd, { project_name: detectProjectName(cwd) }, packs, agents);

  const newFiles = report.written.filter((w) => !w.includes(".gitignore"));
  if (newFiles.length) {
    for (const w of newFiles) ui.ok(c.cream(path.relative(cwd, w.split(" (")[0]!)));
    ui.info(`${newFiles.length} new file(s) added · ${report.skipped.length} left untouched.`);
  } else {
    ui.ok("Content already up to date — nothing new to add.");
  }

  const pending = MIGRATIONS.filter((m) => isNewer(m.version, fromVersion));
  for (const m of pending) {
    ui.step(`Step for ${m.version}: ${m.describe}`);
    m.run(cwd, report);
  }

  ui.plain();
  ui.ok(`On ${c.cyan(pkgVersion())}. No re-init needed.`);
}
