import fs from "node:fs";
import path from "node:path";
import {
  gatherSignals,
  loadCeremonyConfig,
  proposeLevel,
  setCeremonyLevel,
  writeCeremonyRecord,
  type CeremonyLevel,
  type CeremonyProposal,
  type CeremonyRecord,
  type CeremonyTargets,
  type ChangeType,
} from "./levels.js";
import { formatJson } from "../../shared/json.js";

// Covers: req~feature-draft~1

/** Change folder names are kebab-case: lowercase alphanumerics joined by single hyphens. */
export const CHANGE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `change.json` written when a draft has no confirmed level yet (validate treats it as 3). */
export type UnconfirmedRecord = CeremonyProposal & { changeType?: ChangeType };

/** Context handed to the artifact writer once the level is resolved. */
export interface ScaffoldContext {
  name: string;
  proposal: CeremonyProposal;
  /** Confirmed level, or `undefined` when the change is left unconfirmed. */
  level: CeremonyLevel | undefined;
}

export interface ScaffoldChangeOptions {
  /** Written to `change.json` when set; omitted keeps the legacy (feature) default. */
  changeType?: ChangeType;
  /** Paths/symbols used to propose the level (default empty). */
  targets?: CeremonyTargets;
  /**
   * Level to confirm. A function receives the proposal and may return
   * `undefined` to leave the change unconfirmed (no `confirmedLevel`).
   */
  level?: CeremonyLevel | ((proposal: CeremonyProposal) => CeremonyLevel | undefined);
  /** Rewrite the proposal stored in `change.json` (quick annotates the rationale). */
  recordProposal?: (proposal: CeremonyProposal) => CeremonyProposal;
  /** Override reason recorded with the level; required when below the proposal. */
  reason?: string | ((proposal: CeremonyProposal) => string | undefined);
  /** Body of `reports/README.md`. */
  reportsReadme: string;
  /** Artifact files (path relative to the change dir → content) for the resolved level. */
  artifacts: (ctx: ScaffoldContext) => Record<string, string>;
}

export interface ScaffoldChangeResult {
  change: string;
  proposal: CeremonyProposal;
  record: CeremonyRecord | UnconfirmedRecord;
  dir: string;
  level: CeremonyLevel | null;
  changeType: ChangeType;
  files: string[];
}

/**
 * Generic change scaffold shared by `quick`, bug drafts, and feature drafts.
 *
 * Refuses an existing change directory, proposes a
 * ceremony level from `targets`, writes the artifacts the caller asks for plus
 * `reports/README.md`, then records `change.json`. Every refusal happens
 * before the first write, so a rejected scaffold leaves the tree untouched.
 *
 * @param projectPath - Project root with `lawbook/`.
 * @param name - Change folder name (kebab-case).
 * @param opts - Level, change type, and artifact templates.
 * @throws When the change exists or the level is below the proposal without a
 *   reason. Name rules belong to the callers (feature drafts enforce kebab-case).
 */
export function scaffoldChange(
  projectPath: string,
  name: string,
  opts: ScaffoldChangeOptions,
): ScaffoldChangeResult {
  const changeDir = path.join(projectPath, "lawbook", "changes", name);
  if (fs.existsSync(changeDir)) {
    throw new Error(`change "${name}" already exists under lawbook/changes/`);
  }
  const targets = opts.targets ?? { paths: [], symbols: [] };
  const { thresholds } = loadCeremonyConfig(projectPath);
  const signals = gatherSignals(projectPath, targets, thresholds);
  const proposal = proposeLevel(signals, thresholds);
  const level = typeof opts.level === "function" ? opts.level(proposal) : opts.level;
  const stored = opts.recordProposal ? opts.recordProposal(proposal) : proposal;
  const reason = typeof opts.reason === "function" ? opts.reason(proposal) : opts.reason;
  // setCeremonyLevel enforces this too, but only after files exist; check first.
  if (level !== undefined && proposal.level !== null && level < proposal.level && !reason) {
    throw new Error(
      `level ${level} is below the proposed level (${proposal.level}); pass a reason to confirm it`,
    );
  }

  const files = opts.artifacts({ name, proposal, level });
  fs.mkdirSync(path.join(changeDir, "reports"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(changeDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  fs.writeFileSync(path.join(changeDir, "reports", "README.md"), opts.reportsReadme);

  let record: CeremonyRecord | UnconfirmedRecord;
  if (level === undefined) {
    record = opts.changeType ? { ...stored, changeType: opts.changeType } : { ...stored };
    fs.writeFileSync(path.join(changeDir, "change.json"), formatJson(record));
  } else {
    let confirmed = setCeremonyLevel(projectPath, name, {
      proposal: stored,
      level,
      confirmedBy: "human",
      reason,
    });
    if (opts.changeType) {
      confirmed = { ...confirmed, changeType: opts.changeType };
      writeCeremonyRecord(projectPath, name, confirmed);
    }
    record = confirmed;
  }
  return {
    change: name,
    proposal,
    record,
    dir: changeDir,
    level: level ?? null,
    changeType: opts.changeType ?? "feature",
    files: [...Object.keys(files), "reports/README.md", "change.json"],
  };
}

const featureRecordMd = (name: string, level: CeremonyLevel, proposal: CeremonyProposal) =>
  `# ${name}

**Level:** ${level} (proposed: ${proposal.level ?? "n/a"}, confirmed by: human)
**Why:** ${proposal.rationale}

## What changes

<!-- 2–5 lines: what and why. -->

## Steps

- [ ] Make the change
- [ ] Add or update tests
- [ ] Record evidence under reports/

## Evidence

- \`reports/\` — add a discipline report before archive
`;

const featureTasksMd = (name: string) => `# Tasks — ${name}

## 0. Branch

- [ ] 0.1 Create or check out the feature branch

## 1. Implementation

- [ ] 1.1 Implement the change

## 2. Verification

- [ ] 2.1 Review and update the affected tests
- [ ] 2.2 Run the quality gates and verify they pass
- [ ] 2.3 Write the discipline reports under reports/
- [ ] 2.4 Archive the change within the same PR
`;

const featureProposalMd = (name: string) => `# ${name}

## Why

<!-- The problem and who it affects. -->

## What changes

<!-- The behavior after this change. -->

## Impact

<!-- Capabilities, modules, and APIs touched. -->
`;

const featureDesignMd = (name: string) => `# Design — ${name}

## Approach

<!-- Module boundaries, data flow, and decisions. -->
`;

/**
 * Marks an unedited delta stub. Validate warns while it is present and sync
 * refuses to promote it, so a placeholder capability is never synced silently.
 */
export const PLACEHOLDER_DELTA_MARKER = "<!-- speclaw:placeholder-delta -->";

const PLACEHOLDER_LINE_RE = /^<!-- speclaw:placeholder-delta -->[ \t]*$/m;

/**
 * True when a delta still carries the placeholder marker on a line of its own.
 * Prose that quotes the marker inline (e.g. in backticks) does not count, so a
 * spec documenting the marker is never mistaken for a placeholder.
 *
 * @param content - Delta spec text.
 */
export function isPlaceholderDelta(content: string): boolean {
  return PLACEHOLDER_LINE_RE.test(content);
}

/** Starting delta for a capability with no canonical spec yet (a placeholder). */
const featureDeltaMd = (capability: string, change: string) => `# ${capability}

${PLACEHOLDER_DELTA_MARKER}
<!-- Placeholder delta for change ${change}. Replace it with the capability's
     full intended spec (sync overwrites the canonical spec with this file) and
     delete the marker above, or delete this file if the change targets another
     capability (pass --capability <name> when drafting). -->

### Requirement: ${capability} behavior

The system SHALL provide the behavior described in \`proposal.md\` for ${change}.

#### Scenario: The change's behavior is observable
- Given the change ${change} is implemented
- When the behavior is exercised
- Then the outcome described in \`proposal.md\` is observed
`;

/**
 * Stub artifacts for a feature change at `level` (none when unconfirmed).
 *
 * Every level gets what `artifactNeeds` requires, so a fresh draft validates:
 * level 2 includes a `design.md` stub (rather than a record justification),
 * and levels 1–3 include a delta under `specs/<capability>/spec.md`.
 *
 * @param name - Change name.
 * @param level - Confirmed level, or `undefined` for no stubs.
 * @param proposal - Proposal quoted in `record.md`.
 * @param delta - Capability and starting content for the delta (levels 1–3).
 */
export function featureStubs(
  name: string,
  level: CeremonyLevel | undefined,
  proposal: CeremonyProposal,
  delta: { capability: string; content: string } = {
    capability: name,
    content: featureDeltaMd(name, name),
  },
): Record<string, string> {
  const spec = { [`specs/${delta.capability}/spec.md`]: delta.content };
  switch (level) {
    case 0:
      return { "record.md": featureRecordMd(name, 0, proposal) };
    case 1:
      return {
        "record.md": featureRecordMd(name, 1, proposal),
        "tasks.md": featureTasksMd(name),
        ...spec,
      };
    case 2:
    case 3:
      return {
        "proposal.md": featureProposalMd(name),
        "design.md": featureDesignMd(name),
        "tasks.md": featureTasksMd(name),
        ...spec,
      };
    default:
      return {};
  }
}

/**
 * Scaffold a feature change (`speclaw lawbook draft <name>` / `lawbook_change` `draft`).
 *
 * With `level`, the level is confirmed and its stubs are written; without it,
 * `change.json` carries only the proposal and `changeType`, so validate applies
 * level-3 rules until `lawbook level set` confirms one. The delta stub targets
 * `capability` (default: the change name); when that capability already has a
 * canonical spec, the delta starts from a copy of it, so an unedited sync
 * changes nothing.
 *
 * @param projectPath - Project root with `lawbook/`.
 * @param name - Change folder name (kebab-case).
 * @param opts - Optional level, override reason, delta capability, and targets.
 * @throws When `capability` is not kebab-case (plus every `scaffoldChange` refusal).
 */
export function scaffoldFeature(
  projectPath: string,
  name: string,
  opts: {
    level?: CeremonyLevel;
    reason?: string;
    capability?: string;
    targets?: CeremonyTargets;
  } = {},
): ScaffoldChangeResult {
  // Only feature drafts enforce kebab-case: quick and bug drafts keep their
  // pre-existing (unvalidated) naming so their outputs stay unchanged.
  if (!CHANGE_NAME_RE.test(name)) {
    throw new Error(`change name "${name}" must be kebab-case (e.g. add-widget)`);
  }
  const capability = opts.capability ?? name;
  if (!CHANGE_NAME_RE.test(capability)) {
    throw new Error(`capability "${capability}" must be kebab-case (e.g. widgets)`);
  }
  const canonical = path.join(projectPath, "lawbook", "specs", capability, "spec.md");
  const content = fs.existsSync(canonical)
    ? fs.readFileSync(canonical, "utf8")
    : featureDeltaMd(capability, name);
  return scaffoldChange(projectPath, name, {
    changeType: "feature",
    targets: opts.targets,
    level: opts.level,
    reason: opts.reason,
    reportsReadme: `# Reports — ${name}\n\nAdd at least one discipline report before archive.\n`,
    artifacts: ({ level, proposal }) =>
      featureStubs(name, level, proposal, { capability, content }),
  });
}
