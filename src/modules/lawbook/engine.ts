import fs from "node:fs";
import path from "node:path";
import { coverageArchiveBlockers } from "./coverage.js";
import { sealCapability, type SealSummary } from "./anchors.js";
import {
  artifactNeeds,
  confirmedLevel,
  countUncheckedTasks,
  gatherSignals,
  hasDisciplineReport,
  loadCeremonyConfig,
  proposeLevel,
  type CeremonyLevel,
  type CeremonyTargets,
} from "./levels.js";

export type { CeremonyLevel, CeremonyTargets };

// speclaw's own spec-driven workflow engine. Inspired by OpenSpec's model
// (proposals, delta specs, changes, archive) but implemented from scratch and
// deliberately simpler: a change's specs/ holds the full intended spec for each
// affected capability, and sync promotes those into the canonical specs/.

const SPEC_DIR = "lawbook";

function specRoot(projectPath: string): string {
  return path.join(projectPath, SPEC_DIR);
}

/**
 * Report whether the lawbook workspace (lawbook/) has been initialized for a project.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns True if the lawbook/ directory exists.
 */
export function specExists(projectPath: string): boolean {
  return fs.existsSync(specRoot(projectPath));
}

const CONFIG_YAML = `# speclaw lawbook module configuration
# The spec-driven workflow: draft -> build -> sync -> archive (explore anytime).

# Mandatory steps every change's tasks.md must include, in order.
mandatory_task_steps:
  - "Step 0: Create the feature branch (must be first)."
  - "Review and update the affected tests."
  - "Run the quality gates and verify they pass (see docs/standards/testing-standards.md)."
  - "Perform manual verification of the behavior — the agent executes this itself, never the user."
  - "Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched."
  - "Update the technical documentation touched by the change."
  - "Archive the change within the same PR (lawbook:archive)."

# A change is required for new behavior, endpoints, schema changes, or UI flows;
# one-line fixes may use ceremony level 0 (\`speclaw quick\`) instead of full artifacts.

# Ceremony levels (adaptive). Defaults match speclaw's built-in thresholds.
ceremony:
  cuts: [3, 8, 15]
  hotspotFloor: 0.7
`;

const README_MD = `# lawbook/ — the spec-driven workflow (speclaw)

This directory is managed by speclaw's **lawbook** module.

- \`specs/\` — the canonical specifications (the current source of truth).
- \`changes/<name>/\` — an in-flight change. Artifact volume follows the
  confirmed ceremony level in \`change.json\` (0=quick … 3=full). Missing
  \`change.json\` means level 3 (proposal, design, tasks, delta specs).
- \`changes/archive/\` — completed, archived changes.
- \`config.yaml\` — mandatory task steps, coverage, and optional ceremony cuts.

## Workflow

1. \`lawbook:explore\` — think through an idea before or during a change.
2. \`lawbook:draft\` / \`speclaw quick\` — propose/confirm a ceremony level, then
   scaffold only the artifacts that level requires.
3. \`lawbook:build\` — implement the tasks.
4. \`lawbook:sync\` — promote the change's delta specs into \`specs/\` (when the
   level requires specs).
5. \`lawbook:archive\` — sync (if needed) + move the change to \`changes/archive/\`.
`;

/** Outcome of initializing the spec workspace. */
export interface InitResult {
  /** Workspace-relative paths created by this run (directories end in "/"). */
  created: string[];
  /** True if lawbook/ already existed before this run. */
  alreadyExisted: boolean;
}

/**
 * Initialize the spec/ workspace, creating the specs/, changes/, and archive
 * directories plus config.yaml and README. Idempotent — existing files and
 * directories are left untouched.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns The paths created and whether the workspace already existed.
 */
export function specInit(projectPath: string): InitResult {
  const root = specRoot(projectPath);
  const created: string[] = [];
  const alreadyExisted = fs.existsSync(root);
  const ensure = (rel: string, content?: string) => {
    const abs = path.join(root, rel);
    if (content === undefined) {
      if (!fs.existsSync(abs)) {
        fs.mkdirSync(abs, { recursive: true });
        created.push(rel + "/");
      }
    } else if (!fs.existsSync(abs)) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      created.push(rel);
    }
  };
  ensure("specs");
  ensure("changes");
  ensure("changes/archive");
  ensure("config.yaml", CONFIG_YAML);
  ensure("README.md", README_MD);
  return { created, alreadyExisted };
}

/** Result of validating a change's artifacts. */
export interface ValidationResult {
  change: string;
  /** True when no issues were found. */
  valid: boolean;
  /** Human-readable problems that block the change from proceeding. */
  issues: string[];
  /**
   * Advisory notices that do NOT block the change (near-duplicate capability
   * names, requirements dropped versus the canonical). `valid` ignores these.
   */
  warnings: string[];
  /** Project-relative paths of the delta spec files that were inspected. */
  deltaSpecs: string[];
}

/** Names of the canonical capabilities (directories under lawbook/specs/). */
function canonicalCapabilities(root: string): string[] {
  const specsDir = path.join(root, "specs");
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** The "### Requirement:" titles declared in a spec markdown document. */
function requirementHeaders(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/^###\s+Requirement:\s*(.+?)\s*$/gm)) out.push(m[1]!);
  return out;
}

/** Levenshtein edit distance between two strings (small, dependency-free). */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i++) {
    const curr = [i];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[cols - 1]!;
}

/**
 * The existing canonical capability that a name is a near-match of (edit
 * distance ≤ 2 and not equal), or undefined when the name is exact or unrelated.
 */
function nearMatchCapability(name: string, capabilities: string[]): string | undefined {
  if (capabilities.includes(name)) return undefined;
  return capabilities.find((c) => editDistance(name, c) <= 2);
}

/** Recursively collect every .md file under a change's specs/ directory. */
function deltaSpecFiles(changeDir: string): string[] {
  const specsDir = path.join(changeDir, "specs");
  if (!fs.existsSync(specsDir)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".md")) out.push(full);
    }
  };
  walk(specsDir);
  return out;
}

/**
 * Validate a change's artifacts against its confirmed ceremony level
 * (missing `change.json` ⇒ level 3 / full ceremony).
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (folder under lawbook/changes/).
 * @param remeasure - Optional targets to re-score scope growth (paths/symbols).
 */
export function specValidate(
  projectPath: string,
  change: string,
  remeasure?: CeremonyTargets,
): ValidationResult {
  const changeDir = path.join(specRoot(projectPath), "changes", change);
  const issues: string[] = [];
  const warnings: string[] = [];
  if (!fs.existsSync(changeDir)) {
    return {
      change,
      valid: false,
      issues: [`change "${change}" not found under lawbook/changes/`],
      warnings: [],
      deltaSpecs: [],
    };
  }

  const level = confirmedLevel(projectPath, change);
  const needs = artifactNeeds(level);

  if (needs.record && !fs.existsSync(path.join(changeDir, "record.md"))) {
    issues.push(`missing record.md (required at ceremony level ${level})`);
  }
  if (needs.proposal && !fs.existsSync(path.join(changeDir, "proposal.md"))) {
    issues.push(`missing proposal.md (required at ceremony level ${level})`);
  }
  if (needs.design && !fs.existsSync(path.join(changeDir, "design.md"))) {
    issues.push(`missing design.md (required at ceremony level ${level})`);
  }
  if (needs.designOptionalWithJustification && !fs.existsSync(path.join(changeDir, "design.md"))) {
    const record = path.join(changeDir, "record.md");
    const text = fs.existsSync(record) ? fs.readFileSync(record, "utf8") : "";
    if (!/design\s*(omitted|skipped|n\/a)/i.test(text) && !/why.*design/i.test(text)) {
      issues.push(`level ${level}: design.md omitted without justification in record.md`);
    }
  }
  if (needs.tasksFile && !fs.existsSync(path.join(changeDir, "tasks.md"))) {
    issues.push(`missing tasks.md (required at ceremony level ${level})`);
  }

  const deltas = deltaSpecFiles(changeDir);
  if (needs.deltaSpecs && deltas.length === 0) {
    issues.push(`no delta specs under specs/ (required at ceremony level ${level})`);
  }

  // Scope-growth: when remeasure targets provided (or change.json has prior signals
  // with paths we cannot recover), only check if caller passes targets.
  if (remeasure && (remeasure.paths.length > 0 || remeasure.symbols.length > 0)) {
    const { thresholds } = loadCeremonyConfig(projectPath);
    const measured = proposeLevel(gatherSignals(projectPath, remeasure, thresholds), thresholds);
    if (measured.level !== null && measured.level >= level + 2) {
      issues.push(
        `scope grew: measured level ${measured.level}, recorded ${level} — run promote or justify (${measured.rationale})`,
      );
    }
  }

  const root = specRoot(projectPath);
  const changeSpecs = path.join(changeDir, "specs");
  const capabilities = canonicalCapabilities(root);
  for (const file of deltas) {
    const rel = path.relative(changeDir, file);
    const content = fs.readFileSync(file, "utf8");
    if (!/\b(SHALL|MUST)\b/.test(content)) {
      issues.push(`${rel}: no normative requirement (use SHALL/MUST)`);
    }
    if (!/^####\s+Scenario:/m.test(content)) {
      issues.push(`${rel}: no "#### Scenario:" acceptance criteria`);
    }
    if (!/^###\s+Requirement:/m.test(content)) {
      issues.push(`${rel}: no "### Requirement:" header`);
    }

    const relFromSpecs = path.relative(changeSpecs, file);
    const capability = relFromSpecs.split(path.sep)[0]!;
    const nearMatch = nearMatchCapability(capability, capabilities);
    if (nearMatch) {
      warnings.push(
        `${rel}: capability "${capability}" is not canonical but resembles ` +
          `"${nearMatch}" — did you mean to update it? Reuse the exact name to ` +
          `update the existing spec instead of forking a near-duplicate.`,
      );
    } else if (capabilities.includes(capability)) {
      const canonicalFile = path.join(root, "specs", relFromSpecs);
      if (fs.existsSync(canonicalFile)) {
        const deltaReqs = new Set(requirementHeaders(content));
        const dropped = requirementHeaders(fs.readFileSync(canonicalFile, "utf8")).filter(
          (r) => !deltaReqs.has(r),
        );
        if (dropped.length > 0) {
          warnings.push(
            `${rel}: delta drops ${dropped.length} requirement(s) present in the ` +
              `canonical "${capability}" spec (${dropped.join("; ")}) — start the ` +
              `delta from the canonical unless the removal is intentional.`,
          );
        }
      }
    }
  }
  return {
    change,
    valid: issues.length === 0,
    issues,
    warnings,
    deltaSpecs: deltas.map((f) => path.relative(projectPath, f)),
  };
}

/** Result of promoting a change's delta specs into the canonical specs/. */
export interface SyncResult {
  change: string;
  /** Project-relative paths of the canonical spec files written/overwritten. */
  promoted: string[];
  /** Promoted paths whose canonical file did not exist before (new capabilities). */
  created: string[];
  /** Promoted paths that overwrote an existing canonical file. */
  updated: string[];
}

/**
 * Promote a change's delta specs into the canonical specs/, overwriting the
 * file for each affected capability. Each promoted path is also classified as
 * `created` (no canonical file existed) or `updated` (one was overwritten) so an
 * unintended new capability is visible in the result — a pure path check that
 * keeps this a deterministic, code-blind copy.
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (folder under lawbook/changes/).
 * @returns The change name, the promoted spec paths, and the created/updated split.
 * @throws If the change directory does not exist.
 */
export function specSync(projectPath: string, change: string): SyncResult {
  const root = specRoot(projectPath);
  const changeDir = path.join(root, "changes", change);
  if (!fs.existsSync(changeDir)) throw new Error(`change "${change}" not found`);
  const changeSpecs = path.join(changeDir, "specs");
  const promoted: string[] = [];
  const created: string[] = [];
  const updated: string[] = [];
  if (!fs.existsSync(changeSpecs)) return { change, promoted, created, updated };
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".md")) {
        const rel = path.relative(changeSpecs, full);
        const dest = path.join(root, "specs", rel);
        const existed = fs.existsSync(dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(full, dest);
        const promotedPath = path.join("lawbook/specs", rel);
        promoted.push(promotedPath);
        (existed ? updated : created).push(promotedPath);
      }
    }
  };
  walk(changeSpecs);
  return { change, promoted, created, updated };
}

/** Result of archiving a change (sync plus relocation). */
export interface ArchiveResult {
  change: string;
  /** Canonical spec paths promoted during the embedded sync. */
  promoted: string[];
  /** Promoted paths whose canonical file did not exist before (new capabilities). */
  created: string[];
  /** Promoted paths that overwrote an existing canonical file. */
  updated: string[];
  /** Project-relative path the change was moved to. */
  archivedTo: string;
  /** Structural anchors sealed into lawbook/anchors/ during archive. */
  seals: SealSummary[];
}

/**
 * Deterministic completeness checks that gate archiving a change. Returns the
 * blocking reasons; an empty array means the change may be archived.
 *
 * Gates respect the confirmed ceremony level (missing `change.json` ⇒ level 3).
 * Every level still requires checked tasks and a discipline report. Delta-spec
 * sync is required only when the level demands delta specs.
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (folder under lawbook/changes/).
 * @returns Human-readable blockers; empty when the change is ready to archive.
 */
export function specArchivePreconditions(projectPath: string, change: string): string[] {
  const root = specRoot(projectPath);
  const changeDir = path.join(root, "changes", change);
  if (!fs.existsSync(changeDir)) return [`change "${change}" not found under lawbook/changes/`];
  const blockers: string[] = [];
  const level = confirmedLevel(projectPath, change);
  const needs = artifactNeeds(level);

  // 1. Every task must be checked (tasks.md, or checklist in record.md at level 0).
  if (needs.tasksFile) {
    const tasksPath = path.join(changeDir, "tasks.md");
    if (!fs.existsSync(tasksPath)) {
      blockers.push("missing tasks.md");
    } else {
      const unchecked = countUncheckedTasks(fs.readFileSync(tasksPath, "utf8"));
      if (unchecked > 0) blockers.push(`${unchecked} unchecked task(s) in tasks.md`);
    }
  } else if (needs.record) {
    const recordPath = path.join(changeDir, "record.md");
    if (!fs.existsSync(recordPath)) {
      blockers.push("missing record.md");
    } else {
      const unchecked = countUncheckedTasks(fs.readFileSync(recordPath, "utf8"));
      if (unchecked > 0) blockers.push(`${unchecked} unchecked task(s) in record.md`);
    }
  }

  // 2. At least one discipline report must exist (README.md scaffold aside).
  if (!hasDisciplineReport(changeDir)) {
    blockers.push("no discipline report under reports/ (build must record what was tested)");
  }

  // 3. Delta specs must already be synced — only when the level requires them.
  if (needs.deltaSpecs) {
    for (const file of deltaSpecFiles(changeDir)) {
      const rel = path.relative(path.join(changeDir, "specs"), file);
      const canonical = path.join(root, "specs", rel);
      if (!fs.existsSync(canonical)) {
        blockers.push(`spec not synced: lawbook/specs/${rel} missing (run sync first)`);
      } else if (fs.readFileSync(file, "utf8") !== fs.readFileSync(canonical, "utf8")) {
        blockers.push(
          `spec not synced: lawbook/specs/${rel} differs from the delta (run sync first)`,
        );
      }
    }
  }

  // 4. Opt-in coverage gate: only when the change's delta specs declare ids.
  blockers.push(...coverageArchiveBlockers(projectPath, change));

  return blockers;
}

/**
 * Finalize a change: promote its delta specs (via {@link specSync}) when the
 * ceremony level requires them, then move it to changes/archive/<date>-<name>/.
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (folder under lawbook/changes/).
 * @param date - Archive date prefix, formatted YYYY-MM-DD.
 * @returns The promoted specs and the archive destination path.
 * @throws If the change does not exist, the archive target already exists, or
 *   any archive precondition (see {@link specArchivePreconditions}) is unmet.
 */
export function specArchive(projectPath: string, change: string, date: string): ArchiveResult {
  const root = specRoot(projectPath);
  const changeDir = path.join(root, "changes", change);
  if (!fs.existsSync(changeDir)) throw new Error(`change "${change}" not found`);
  const blockers = specArchivePreconditions(projectPath, change);
  if (blockers.length > 0) {
    throw new Error(
      `cannot archive "${change}" — resolve first:\n${blockers.map((b) => `  - ${b}`).join("\n")}`,
    );
  }
  const level = confirmedLevel(projectPath, change);
  const sync = artifactNeeds(level).deltaSpecs
    ? specSync(projectPath, change)
    : { change, promoted: [] as string[], created: [] as string[], updated: [] as string[] };
  const { promoted, created, updated } = sync;
  const seals = sealPromotedCapabilities(projectPath, change, [
    ...promoted,
    ...created,
    ...updated,
  ]);
  const archiveDir = path.join(root, "changes", "archive", `${date}-${change}`);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  if (fs.existsSync(archiveDir)) throw new Error(`archive target already exists: ${archiveDir}`);
  fs.renameSync(changeDir, archiveDir);
  return {
    change,
    promoted,
    created,
    updated,
    archivedTo: path.relative(projectPath, archiveDir),
    seals,
  };
}

/**
 * Seal structural anchors for every capability whose canonical spec was
 * promoted during archive. Missing specs are skipped; zero anchors warn via
 * {@link SealSummary.warned} but never block archive.
 */
function sealPromotedCapabilities(
  projectPath: string,
  change: string,
  promotedPaths: string[],
): SealSummary[] {
  const caps = new Set<string>();
  for (const p of promotedPaths) {
    // lawbook/specs/<capability>/spec.md → capability
    const parts = p.replace(/\\/g, "/").split("/");
    const specsIdx = parts.indexOf("specs");
    if (specsIdx >= 0 && parts[specsIdx + 1]) caps.add(parts[specsIdx + 1]!);
  }
  const out: SealSummary[] = [];
  for (const capability of [...caps].sort()) {
    const specPath = path.join(specRoot(projectPath), "specs", capability, "spec.md");
    if (!fs.existsSync(specPath)) continue;
    out.push(
      sealCapability(projectPath, capability, fs.readFileSync(specPath, "utf8"), {
        specId: `${capability}#${change}`,
      }),
    );
  }
  return out;
}

/** Snapshot of the spec workspace contents. */
export interface ListResult {
  /** True if spec/ exists; when false the other lists are empty. */
  initialized: boolean;
  /** Names of in-flight changes under changes/ (excluding archive/). */
  activeChanges: string[];
  /** Confirmed ceremony level per active change (missing change.json ⇒ 3). */
  activeLevels: Record<string, CeremonyLevel>;
  /** Names of completed changes under changes/archive/. */
  archivedChanges: string[];
  /** Names of canonical capabilities under specs/. */
  capabilities: string[];
}

/**
 * List the spec workspace: active changes, archived changes, and canonical
 * capabilities.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns The workspace snapshot; `initialized` is false when spec/ is absent.
 */
export function specList(projectPath: string): ListResult {
  const root = specRoot(projectPath);
  if (!fs.existsSync(root)) {
    return {
      initialized: false,
      activeChanges: [],
      activeLevels: {},
      archivedChanges: [],
      capabilities: [],
    };
  }
  const dirsIn = (rel: string): string[] => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "archive")
      .map((e) => e.name);
  };
  const activeChanges = dirsIn("changes");
  const activeLevels: Record<string, CeremonyLevel> = {};
  for (const name of activeChanges) {
    activeLevels[name] = confirmedLevel(projectPath, name);
  }
  return {
    initialized: true,
    activeChanges,
    activeLevels,
    archivedChanges: dirsIn("changes/archive"),
    capabilities: dirsIn("specs"),
  };
}
