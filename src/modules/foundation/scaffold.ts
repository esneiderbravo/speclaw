import fs from "node:fs";
import path from "node:path";
import { assetsDir } from "../../shared/paths.js";
import { render } from "../../shared/render.js";
import { InstallReport, CopyOpts, emptyReport, ensureGitignore } from "../../shared/install.js";
import { configureAgent } from "../../shared/agents.js";
import { installWorkflow } from "../lawbook/register.js";
import { installPack, loadPacks } from "../tools/packs.js";
import { readManifest, writeManifest } from "../../shared/manifest.js";
import { pkgVersion } from "../../shared/version.js";
import {
  LawManifest,
  mergeSeedLaws,
  readLawManifest,
  seedManifestFor,
  writeLawManifest,
} from "./laws.js";
import { HookInstallResult, installHooks } from "./hooks.js";
import { compileLaws } from "./compile-laws.js";
import { driftedStrictPaths, refreshLockfile } from "./lock.js";
export { lockPreservedWarning } from "./lock.js";
import { refreshOwnersIfConfigured } from "../team/owners.js";

const ASSETS = assetsDir(import.meta.url);

/**
 * The project's identity and conventions, gathered by analyzing the repo, used
 * to render the foundation templates. Only `project_name` is required; omitted
 * fields fall back to {@link FOUNDATION_DEFAULTS}.
 */
export interface Profile {
  project_name: string;
  project_description?: string;
  organization?: string;
  stack_summary?: string;
  architecture?: string;
  test_commands?: string;
  lint_commands?: string;
  branch_pattern?: string;
  commit_style?: string;
  custom_laws?: string;
  compass_hints?: string;
  base_standards_extra?: string;
  modules_table?: string;
  layering_rules?: string;
  backend_layers?: string;
  frontend_layers?: string;
  versioning_rules?: string;
  documentation_extra?: string;
}

// Every {{var}} the foundation templates may reference. Ones the agent didn't
// provide default to empty so a bare `scaffold` never leaves a raw {{tag}}.
const FOUNDATION_DEFAULTS: Record<string, string> = {
  custom_laws: "",
  compass_hints: "",
  base_standards_extra: "",
  modules_table: "",
  layering_rules: "",
  backend_layers: "",
  frontend_layers: "",
  versioning_rules: "",
  documentation_extra: "",
};

/** Install report for a scaffold run, plus the ordered follow-up actions. */
export interface ScaffoldReport extends InstallReport {
  /** Ordered next actions for the agent/user after scaffolding. */
  nextSteps: string[];
  /** Which agents got hooks, which were skipped, and any laws rejected for bad globs. */
  hooks?: HookInstallResult;
  /**
   * Strict rule files that drifted from `speclaw.lock` before this run and kept
   * their locked digest; each needs a human `speclaw laws accept <path>`.
   */
  lockPreserved: string[];
  /**
   * Why `speclaw.lock` was left untouched: it exists but cannot be read (parse
   * error, unsupported `lockfileVersion`). Absent when the lock was refreshed.
   */
  lockError?: string;
}

/**
 * Ensure the project has a law manifest. Missing → adapted seed for this tree.
 * Present → merge the adapted catalog (never overwrite a curated entry; prune
 * unmodified dogfood laws whose required paths are absent).
 */
function ensureLawManifest(projectPath: string, report: InstallReport): LawManifest {
  const existing = readLawManifest(projectPath);
  if (!existing) {
    const seed = seedManifestFor(projectPath);
    writeLawManifest(projectPath, seed);
    report.written.push(path.join(projectPath, ".speclaw", "laws-manifest.json"));
    return seed;
  }
  const { manifest, added, removed } = mergeSeedLaws(existing, projectPath);
  if (
    added.length > 0 ||
    removed.length > 0 ||
    JSON.stringify(manifest.laws) !== JSON.stringify(existing.laws)
  ) {
    writeLawManifest(projectPath, manifest);
    report.written.push(path.join(projectPath, ".speclaw", "laws-manifest.json"));
  }
  return manifest;
}

/**
 * Render the foundation: walk the module's assets/, mirror its structure into
 * the project, stripping the `.template` marker (foo.template.md -> foo.md).
 * Directory-driven — adding a standard is dropping a file, no code change.
 *
 * @param projectPath - Absolute path to the project root.
 * @param vars - Template variables substituted into each `.template.md`.
 * @param report - Mutated in place with written/skipped paths and any
 *   unresolved template variables. Existing destination files are skipped.
 */
function renderFoundation(
  projectPath: string,
  vars: Record<string, string | undefined>,
  report: InstallReport,
): void {
  const walk = (relDir: string): void => {
    for (const entry of fs.readdirSync(path.join(ASSETS, relDir), { withFileTypes: true })) {
      const rel = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        walk(rel);
        continue;
      }
      if (!entry.name.endsWith(".template.md")) continue;
      const destPath = path.join(projectPath, rel.replace(/\.template\.md$/, ".md"));
      if (fs.existsSync(destPath)) {
        report.skipped.push(destPath);
        continue;
      }
      const { output, unresolved } = render(fs.readFileSync(path.join(ASSETS, rel), "utf8"), vars);
      unresolved.forEach((v) => {
        if (!report.unresolvedVars.includes(v)) report.unresolvedVars.push(v);
      });
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, output);
      report.written.push(destPath);
    }
  };
  walk(".");
}

/**
 * Write the speclaw content into a project: the foundation (constitution +
 * standards), the spec workflow (always), the selected tool packs, .gitignore,
 * and — for each agent id passed — that agent's symlinks + MCP config. Agent
 * selection is what the CLI drives interactively; omit it to write content only.
 * Never overwrites existing files.
 *
 * @param projectPath - Absolute path to an existing project root.
 * @param profile - Project identity and conventions for template rendering.
 * @param packNames - Tool pack names to install (the spec workflow is always installed).
 * @param agents - Agent ids to configure with symlinks + MCP; empty writes content only.
 * @param opts - `refreshManaged: true` overwrites the managed trees (skills,
 *   commands, rules, agents) with the current version; `backup: true` also keeps
 *   a `<file>.bak` of any locally edited managed file before overwriting it (the
 *   default overwrites in place — git preserves the prior content). Default
 *   (init) is additive — existing files are kept.
 * @returns The install report augmented with the ordered next steps to run.
 * @throws If `projectPath` does not exist, or any pack name is unknown.
 */
export function scaffold(
  projectPath: string,
  profile: Profile,
  packNames: string[],
  agents: string[] = [],
  opts: { refreshManaged?: boolean; backup?: boolean; minimal?: boolean } = {},
): ScaffoldReport {
  if (!fs.existsSync(projectPath)) {
    throw new Error(`projectPath does not exist: ${projectPath}`);
  }
  const packs = loadPacks();
  const unknown = packNames.filter((n) => !packs[n]);
  if (unknown.length) throw new Error(`Unknown packs: ${unknown.join(", ")}`);

  const report: ScaffoldReport = { ...emptyReport(), nextSteps: [], lockPreserved: [] };
  // Snapshot strict-file drift before writing anything: the rule files written
  // below (foundation, agents, compiled laws) must not re-baseline an edit made
  // outside the pipeline.
  // A lockfile that exists but cannot be read is reported in `lockError` and
  // left byte-identical: rebuilding it from disk would launder drift.
  let drifted: string[] = [];
  try {
    drifted = driftedStrictPaths(projectPath);
  } catch (err) {
    report.lockError = (err as Error).message;
  }
  const vars: Record<string, string | undefined> = { ...FOUNDATION_DEFAULTS, ...profile };

  // Managed trees (MANAGED_TREES) carry speclaw's workflow logic and may be
  // overwritten on update; the foundation (personalized) is always additive.
  const record: Record<string, string> = {};
  const managedOpts: CopyOpts = {
    overwrite: Boolean(opts.refreshManaged),
    backup: Boolean(opts.backup),
    projectPath,
    baselines: readManifest(projectPath)?.baselines ?? {},
    record,
  };

  renderFoundation(projectPath, vars, report); // personalized — never overwritten
  installWorkflow(projectPath, vars, report, managedOpts); // managed
  for (const name of packNames) installPack(projectPath, name, vars, report, managedOpts); // managed

  ensureGitignore(projectPath, ".speclaw/", "speclaw local code Compass (never commit)", report);
  ensureGitignore(projectPath, "*.bak", "speclaw managed-file refresh backups", report);
  // ai-specs/ is regenerable from the package (installWorkflow/installPack copy
  // it out of the module assets) plus the local .speclaw.json manifest — local,
  // per-checkout content, reconstructed by init/update, never committed.
  ensureGitignore(
    projectPath,
    "ai-specs/",
    "speclaw workflow content (regenerated by init/update; never commit)",
    report,
  );
  // The integrity lock is local tool state: it guards this checkout's rule
  // files and is rebuilt by init/update, so it is not committed.
  ensureGitignore(
    projectPath,
    "speclaw.lock",
    "speclaw local integrity lock (never commit)",
    report,
  );
  for (const id of agents) configureAgent(projectPath, id, report); // only the chosen agents

  // Compile the declared laws into agent hooks for every hook-capable agent just
  // configured. The seam is the manifest: check-dispatcher enforces `path` laws;
  // executable-laws will extend the same manifest with more backends.
  const lawManifest = ensureLawManifest(projectPath, report);
  try {
    compileLaws({ projectPath, agents, writeManifest: false, drifted, refreshLock: false });
  } catch {
    // Compilation must not fail scaffold; `speclaw laws compile` surfaces errors.
  }
  // Covers: req~lock-refresh-update~1
  if (report.lockError === undefined) {
    try {
      report.lockPreserved = refreshLockfile(projectPath, { drifted }).preserved;
    } catch (err) {
      // refreshLockfile throws before writing; init/update surface lockError.
      report.lockError = (err as Error).message;
    }
  }
  report.hooks = installHooks(projectPath, agents, lawManifest, report, {
    baselines: managedOpts.baselines,
    backup: managedOpts.backup,
    record,
  });

  // Refresh CODEOWNERS managed block when the project declared team.owners —
  // never invent owners when the key is absent.
  try {
    refreshOwnersIfConfigured(projectPath);
  } catch (err) {
    // Surface as a soft note — invalid tokens should not abort scaffold/update.
    report.skipped.push(`owners refresh skipped: ${(err as Error).message}`);
  }

  // Record what was installed so `speclaw update` can re-apply these packs and
  // gate feature migrations by version, plus the managed-file baselines that let
  // a later update tell user edits from stale files.
  writeManifest(
    projectPath,
    pkgVersion(),
    packNames,
    record,
    opts.minimal !== undefined ? { minimal: opts.minimal } : {},
  );

  report.nextSteps = [
    "Run the `lawbook_change` tool with action `init` to set up the spec-driven workflow (creates lawbook/). No external CLI needed — it's built into speclaw.",
    "Run the `compass_index` tool to build the local code graph (.speclaw/). No install, no LLM — it's built into speclaw. Re-run it after significant edits.",
    "Analyze the repo's real entrypoints and core flows, then fill in the 'Project-specific starting points' section of docs/compass.md (or pass compass_hints in the profile) so agents know where to start querying.",
    "Fill in the per-standard sections left as HTML comments in docs/standards/* (architecture module table, backend/frontend layer tables, versioning) by analyzing the real repo. These are the granular laws CLAUDE.md, AGENTS.md and the dev agents reference.",
    "Read the generated LAWS.md, CLAUDE.md, AGENTS.md and docs/standards/* with the user and refine any standard that does not match how the team actually works.",
    report.unresolvedVars.length
      ? `Fill in the unresolved template variables (${report.unresolvedVars.join(", ")}) by editing the affected files or re-running scaffold with a more complete profile.`
      : "",
  ].filter(Boolean);

  return report;
}

/**
 * Wire one agent into an already-initialized project: its links and MCP entry
 * (via `configureAgent`) plus, for a hook-capable agent, speclaw's hooks.
 *
 * @remarks
 * `configureAgent` alone left a later-added Claude Code without its
 * SessionStart / PostToolUse / Stop hooks, so Compass never refreshed and the
 * Stop hook never shipped the change. The hooks' baseline is recorded in the
 * manifest when the project has one, so a later `update` treats the file as
 * speclaw's own rather than a user edit.
 *
 * @param projectPath - Project root.
 * @param agentId - Agent id from `AGENTS` (e.g. `"claude"`).
 * @param report - Install report mutated in place.
 * @returns Which agents got hooks, were skipped, and any laws rejected for bad globs.
 * @throws When `agentId` is not a known agent.
 */
export function addAgent(
  projectPath: string,
  agentId: string,
  report: InstallReport,
): HookInstallResult {
  configureAgent(projectPath, agentId, report);
  const manifest = readManifest(projectPath);
  const record: Record<string, string> = {};
  const lawManifest = readLawManifest(projectPath) ?? { version: 1, laws: [] };
  const hooks = installHooks(projectPath, [agentId], lawManifest, report, {
    baselines: manifest?.baselines ?? {},
    record,
  });
  if (manifest && Object.keys(record).length > 0) {
    writeManifest(projectPath, manifest.version, [], record);
  }
  return hooks;
}
