import fs from "node:fs";
import path from "node:path";

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
  - "Update the technical documentation touched by the change."
  - "Archive the change within the same PR (lawbook:archive)."

# A change is required for new behavior, endpoints, schema changes, or UI flows;
# one-line fixes need not have one.
`;

const README_MD = `# lawbook/ — the spec-driven workflow (speclaw)

This directory is managed by speclaw's **lawbook** module.

- \`specs/\` — the canonical specifications (the current source of truth).
- \`changes/<name>/\` — an in-flight change: \`proposal.md\`, \`tasks.md\`,
  \`design.md\`, and \`specs/<capability>/spec.md\` delta specs.
- \`changes/archive/\` — completed, archived changes.
- \`config.yaml\` — mandatory task steps and workflow rules.

## Workflow

1. \`lawbook:draft\` — describe the change; generates proposal, delta specs, tasks.
2. \`lawbook:build\` — implement the tasks.
3. \`lawbook:sync\` — promote the change's delta specs into \`specs/\`.
4. \`lawbook:archive\` — sync + move the change to \`changes/archive/\`.
5. \`lawbook:explore\` — think through an idea before or during a change.
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
  /** Project-relative paths of the delta spec files that were inspected. */
  deltaSpecs: string[];
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
 * Validate a change's artifacts: proposal.md and tasks.md must be present, and
 * each delta spec must use normative language (SHALL/MUST), a "### Requirement:"
 * header, and a "#### Scenario:" acceptance criterion.
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (folder under lawbook/changes/).
 * @returns The validation verdict and the list of issues to fix; never throws
 *   for a missing change — it is reported as an issue with `valid: false`.
 */
export function specValidate(projectPath: string, change: string): ValidationResult {
  const changeDir = path.join(specRoot(projectPath), "changes", change);
  const issues: string[] = [];
  if (!fs.existsSync(changeDir)) {
    return {
      change,
      valid: false,
      issues: [`change "${change}" not found under lawbook/changes/`],
      deltaSpecs: [],
    };
  }
  if (!fs.existsSync(path.join(changeDir, "proposal.md"))) issues.push("missing proposal.md");
  const tasksPath = path.join(changeDir, "tasks.md");
  if (!fs.existsSync(tasksPath)) issues.push("missing tasks.md");

  const deltas = deltaSpecFiles(changeDir);
  if (deltas.length === 0)
    issues.push("no delta specs under specs/ (a change should specify what it changes)");
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
  }
  return {
    change,
    valid: issues.length === 0,
    issues,
    deltaSpecs: deltas.map((f) => path.relative(projectPath, f)),
  };
}

/** Result of promoting a change's delta specs into the canonical specs/. */
export interface SyncResult {
  change: string;
  /** Project-relative paths of the canonical spec files written/overwritten. */
  promoted: string[];
}

/**
 * Promote a change's delta specs into the canonical specs/, overwriting the
 * file for each affected capability.
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (folder under lawbook/changes/).
 * @returns The change name and the list of promoted spec paths.
 * @throws If the change directory does not exist.
 */
export function specSync(projectPath: string, change: string): SyncResult {
  const root = specRoot(projectPath);
  const changeDir = path.join(root, "changes", change);
  if (!fs.existsSync(changeDir)) throw new Error(`change "${change}" not found`);
  const changeSpecs = path.join(changeDir, "specs");
  const promoted: string[] = [];
  if (!fs.existsSync(changeSpecs)) return { change, promoted };
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".md")) {
        const rel = path.relative(changeSpecs, full);
        const dest = path.join(root, "specs", rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(full, dest);
        promoted.push(path.join("lawbook/specs", rel));
      }
    }
  };
  walk(changeSpecs);
  return { change, promoted };
}

/** Result of archiving a change (sync plus relocation). */
export interface ArchiveResult {
  change: string;
  /** Canonical spec paths promoted during the embedded sync. */
  promoted: string[];
  /** Project-relative path the change was moved to. */
  archivedTo: string;
}

/**
 * Finalize a change: promote its delta specs (via {@link specSync}), then move
 * it to changes/archive/<date>-<name>/.
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (folder under lawbook/changes/).
 * @param date - Archive date prefix, formatted YYYY-MM-DD.
 * @returns The promoted specs and the archive destination path.
 * @throws If the change does not exist, or the archive target already exists.
 */
export function specArchive(projectPath: string, change: string, date: string): ArchiveResult {
  const root = specRoot(projectPath);
  const changeDir = path.join(root, "changes", change);
  if (!fs.existsSync(changeDir)) throw new Error(`change "${change}" not found`);
  const { promoted } = specSync(projectPath, change);
  const archiveDir = path.join(root, "changes", "archive", `${date}-${change}`);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  if (fs.existsSync(archiveDir)) throw new Error(`archive target already exists: ${archiveDir}`);
  fs.renameSync(changeDir, archiveDir);
  return { change, promoted, archivedTo: path.relative(projectPath, archiveDir) };
}

/** Snapshot of the spec workspace contents. */
export interface ListResult {
  /** True if spec/ exists; when false the other lists are empty. */
  initialized: boolean;
  /** Names of in-flight changes under changes/ (excluding archive/). */
  activeChanges: string[];
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
    return { initialized: false, activeChanges: [], archivedChanges: [], capabilities: [] };
  }
  const dirsIn = (rel: string): string[] => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "archive")
      .map((e) => e.name);
  };
  return {
    initialized: true,
    activeChanges: dirsIn("changes"),
    archivedChanges: dirsIn("changes/archive"),
    capabilities: dirsIn("specs"),
  };
}
