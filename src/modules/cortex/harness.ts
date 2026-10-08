/**
 * Deterministic multi-agent harness state for a lawbook change.
 *
 * Speclaw does not spawn LLMs. This module only persists stage transitions;
 * the host agent (Cursor/Claude/…) follows the Cortex skill and calls these
 * ops via `speclaw cortex` or the `cortex` MCP tool.
 *
 * Cortex must not import from the lawbook module (no cycles). Ceremony level
 * is read locally from `change.json` `confirmedLevel` (default 3) at start and
 * again on every advance and rework.
 */

import fs from "node:fs";
import path from "node:path";
import {
  GATED_STAGES,
  compassGateError,
  compassGateWarning,
  evaluateCompassGate,
  readCompassGateMode,
  type CompassEvidence,
} from "./compass-gate.js";
import { buildStatusSummary, type CortexStatusSummary } from "./status.js";
import { resolveChangeDir, type ResolvedChangeDir } from "./paths.js";

export { resolveChangeDir, type ResolvedChangeDir } from "./paths.js";

// Harness types live in the leaf `types.ts` so `compass-gate.ts` can use them
// without importing this file back (no file-level import cycle).
export {
  HARNESS_STAGES,
  type CeremonyLevel,
  type HarnessHistoryEntry,
  type HarnessStage,
  type HarnessState,
  type HarnessVerdict,
} from "./types.js";
import type { CeremonyLevel, HarnessStage, HarnessState, HarnessVerdict } from "./types.js";
import { formatJson } from "../../shared/json.js";

/**
 * Result of a gated `advance`: the persisted state plus the Compass-first gate
 * outcome. `compassEvidence` and `warnings` are never written to harness.json.
 */
export type HarnessAdvanceResult = HarnessState & {
  compassEvidence?: CompassEvidence;
  warnings?: string[];
};

/**
 * Result of `status`: the summary, then the raw state (both null without a
 * harness). `summary` comes first so a reader that cuts from the end keeps it.
 */
export interface HarnessStatusResult {
  summary: CortexStatusSummary | null;
  state: HarnessState | null;
}

export const harnessOps = ["status", "start", "advance", "rework"] as const;
export type HarnessOp = (typeof harnessOps)[number];

const DEFAULT_MAX_REWORK = 3;

function specRoot(projectPath: string): string {
  return path.join(projectPath, "lawbook");
}

function changeDir(projectPath: string, change: string): string {
  return (
    resolveChangeDir(projectPath, change)?.dir ??
    path.join(specRoot(projectPath), "changes", change)
  );
}

function harnessPath(projectPath: string, change: string): string {
  return path.join(changeDir(projectPath, change), "harness.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireChangeDir(projectPath: string, change: string): ResolvedChangeDir {
  const resolved = resolveChangeDir(projectPath, change);
  if (!resolved) {
    const changesDir = path.join(specRoot(projectPath), "changes");
    const active = fs.existsSync(changesDir)
      ? fs
          .readdirSync(changesDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name !== "archive")
          .map((e) => e.name)
      : [];
    // Name the next step: most misses are a start before the change was drafted.
    throw new Error(
      `change "${change}" not found under lawbook/changes/ — draft it first ` +
        `(lawbook_change action 'draft')` +
        (active.length ? `; active: ${active.join(", ")}` : ""),
    );
  }
  return resolved;
}

/**
 * Read confirmed ceremony level from change.json without importing lawbook.
 * Missing file or field → 3.
 */
function readConfirmedLevel(projectPath: string, change: string): CeremonyLevel {
  const p = path.join(changeDir(projectPath, change), "change.json");
  if (!fs.existsSync(p)) return 3;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { confirmedLevel?: unknown };
    const n = raw.confirmedLevel;
    if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  } catch {
    /* default */
  }
  return 3;
}

/** Read harness.json or return null when absent. */
export function readHarness(projectPath: string, change: string): HarnessState | null {
  requireChangeDir(projectPath, change);
  const p = harnessPath(projectPath, change);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as HarnessState;
}

function writeHarness(projectPath: string, change: string, state: HarnessState): void {
  const p = harnessPath(projectPath, change);
  fs.writeFileSync(p, formatJson(state));
}

function nextAfterExplore(level: CeremonyLevel): HarnessStage {
  return level === 0 ? "implementing" : "planning";
}

function nextAfterImplement(level: CeremonyLevel): HarnessStage {
  return level === 0 ? "testing" : "reviewing";
}

/**
 * Legal one-step advances (not rework). Rework is handled separately.
 */
function allowedAdvance(
  from: HarnessStage,
  level: CeremonyLevel,
  verdict?: HarnessVerdict,
): HarnessStage {
  switch (from) {
    case "exploring":
      return nextAfterExplore(level);
    case "planning":
      return "implementing";
    case "questions":
      return "planning";
    case "implementing":
      return nextAfterImplement(level);
    case "reviewing":
      if (verdict === "FAIL") {
        throw new Error(
          `harness advance from reviewing with FAIL requires op "rework" (not advance)`,
        );
      }
      if (verdict !== "PASS") {
        throw new Error(`harness advance from reviewing requires verdict PASS or FAIL`);
      }
      return "testing";
    case "testing":
      if (verdict === "FAIL") {
        throw new Error(`harness advance from testing with FAIL requires op "rework"`);
      }
      if (verdict !== "PASS") {
        throw new Error(`harness advance from testing requires verdict PASS or FAIL`);
      }
      return "archiving";
    case "archiving":
      return "done";
    case "done":
      throw new Error(`harness already done — no further advance`);
    default: {
      const _exhaustive: never = from;
      throw new Error(`unknown stage ${String(_exhaustive)}`);
    }
  }
}

export type HarnessHandleArgs = {
  projectPath: string;
  change: string;
  harnessOp: HarnessOp;
  /** Target stage for start's initial override is not supported; used by advance/rework notes. */
  note?: string;
  verdict?: HarnessVerdict | null;
  /** Planner → questions: set open questions; clearing happens on advance from questions. */
  openQuestions?: string[];
  /** planning → questions; rejected (no write) from any other stage. */
  pauseForQuestions?: boolean;
};

/**
 * Dispatch a harness op for a change. `status` also returns the status
 * summary (`req~cortex-status-summary~1`); other ops return the state.
 *
 * // Covers: req~harness-state~1
 */
export function handleHarness(args: HarnessHandleArgs): HarnessAdvanceResult | HarnessStatusResult {
  const { projectPath, change, harnessOp } = args;
  const resolved = requireChangeDir(projectPath, change);

  if (harnessOp === "status") {
    const state = readHarness(projectPath, change);
    return { summary: state ? buildStatusSummary(projectPath, state) : null, state };
  }

  // An archived change is read-only: reject mutating ops before any write.
  // Covers: req~harness-archive-completes~1
  if (resolved.archived) {
    throw new Error(
      `change ${change} is archived (${path.relative(projectPath, resolved.dir)}); ` +
        `Cortex ops are read-only`,
    );
  }

  if (harnessOp === "start") {
    const existing = readHarness(projectPath, change);
    if (existing && existing.stage !== "done") {
      throw new Error(
        `harness already started for "${change}" (stage=${existing.stage}); use status/advance/rework`,
      );
    }
    const level = readConfirmedLevel(projectPath, change);
    const state: HarnessState = {
      version: 1,
      change,
      stage: "exploring",
      level,
      iteration: 0,
      maxRework: DEFAULT_MAX_REWORK,
      verdicts: { review: null, test: null },
      openQuestions: [],
      history: [
        {
          at: nowIso(),
          from: "exploring",
          to: "exploring",
          op: "start",
          note: args.note,
        },
      ],
    };
    writeHarness(projectPath, change, state);
    return state;
  }

  const current = readHarness(projectPath, change);
  if (!current) {
    throw new Error(`no harness.json for "${change}" — run cortex start first`);
  }

  // Covers: req~harness-level-current~1
  // The level is re-read on every mutating op, so a `level set` after start
  // governs the next route; unconfirmed or missing → 3 (never skips planning).
  const level = readConfirmedLevel(projectPath, change);

  if (harnessOp === "advance") {
    // Covers: req~harness-pause-questions~1
    // Only the planner may pause for questions; anywhere else the pause would
    // be dropped silently, so it is rejected before any write.
    if (args.pauseForQuestions && current.stage !== "planning") {
      throw new Error(
        `pauseForQuestions is only valid from stage planning (current: ${current.stage})`,
      );
    }
    if (args.pauseForQuestions) {
      const questions = args.openQuestions ?? [];
      if (questions.length === 0) {
        throw new Error(`pauseForQuestions requires at least one openQuestions entry`);
      }
      const next: HarnessState = {
        ...current,
        stage: "questions",
        level,
        openQuestions: questions,
        history: [
          ...current.history,
          {
            at: nowIso(),
            from: "planning",
            to: "questions",
            op: "advance",
            note: args.note,
          },
        ],
      };
      writeHarness(projectPath, change, next);
      return next;
    }

    const to = allowedAdvance(current.stage, level, args.verdict ?? undefined);

    // Compass-first gate: runs before any write, so a strict rejection leaves
    // harness.json byte-identical.
    let compassEvidence: CompassEvidence | undefined;
    const warnings: string[] = [];
    const mode = GATED_STAGES.has(current.stage) ? readCompassGateMode(projectPath) : "off";
    if (mode !== "off") {
      const { satisfied, ...evidence } = evaluateCompassGate(projectPath, current, mode);
      compassEvidence = evidence;
      if (!satisfied && mode === "strict") throw new Error(compassGateError(evidence));
      if (!satisfied) warnings.push(compassGateWarning(evidence));
    }

    const verdicts = { ...current.verdicts };
    if (current.stage === "reviewing" && args.verdict) verdicts.review = args.verdict;
    if (current.stage === "testing" && args.verdict) verdicts.test = args.verdict;

    const next: HarnessState = {
      ...current,
      stage: to,
      level,
      verdicts,
      openQuestions: current.stage === "questions" ? [] : current.openQuestions,
      history: [
        ...current.history,
        {
          at: nowIso(),
          from: current.stage,
          to,
          op: "advance",
          note: args.note,
        },
      ],
    };
    writeHarness(projectPath, change, next);
    if (!compassEvidence) return next;
    return warnings.length ? { ...next, compassEvidence, warnings } : { ...next, compassEvidence };
  }

  if (harnessOp === "rework") {
    if (current.stage !== "reviewing" && current.stage !== "testing") {
      throw new Error(`rework only allowed from reviewing or testing (now ${current.stage})`);
    }
    if (args.verdict !== "FAIL") {
      throw new Error(`rework requires verdict FAIL`);
    }
    if (current.iteration >= current.maxRework) {
      throw new Error(
        `max rework (${current.maxRework}) reached — coordinator must ask the human before continuing`,
      );
    }
    const verdicts = { ...current.verdicts };
    if (current.stage === "reviewing") verdicts.review = "FAIL";
    if (current.stage === "testing") verdicts.test = "FAIL";

    const next: HarnessState = {
      ...current,
      stage: "implementing",
      level,
      iteration: current.iteration + 1,
      verdicts,
      history: [
        ...current.history,
        {
          at: nowIso(),
          from: current.stage,
          to: "implementing",
          op: "rework",
          note: args.note,
        },
      ],
    };
    writeHarness(projectPath, change, next);
    return next;
  }

  throw new Error(`unknown harnessOp '${String(harnessOp)}'`);
}

/** Outcome of {@link completeHarnessOnArchive}. */
export interface HarnessArchiveCompletion {
  /** True when the harness moved from `archiving` to `done`. */
  completed: boolean;
  /** Write back the harness bytes from before the call (no-op when nothing changed). */
  restore: () => void;
}

/**
 * Complete a change's harness as part of archiving: move stage `archiving` to
 * `done` with one history entry. Called by the lawbook archive **before** the
 * change directory moves, so a crash cannot leave the harness stuck; the
 * returned `restore` puts the old bytes back if the move fails. A missing
 * harness or one already `done` is left untouched.
 *
 * @param projectPath - Absolute path to the project root.
 * @param change - Change name (an active change).
 * @param note - History note naming the archive.
 * @returns Whether the harness was completed and how to undo it.
 * @throws If the harness is in any other stage (the archive gate prevents this).
 */
// Covers: req~harness-archive-completes~1
export function completeHarnessOnArchive(
  projectPath: string,
  change: string,
  note: string,
): HarnessArchiveCompletion {
  const noop: HarnessArchiveCompletion = { completed: false, restore: () => {} };
  const p = harnessPath(projectPath, change);
  if (!fs.existsSync(p)) return noop;
  const original = fs.readFileSync(p, "utf8");
  const state = JSON.parse(original) as HarnessState;
  if (state.stage === "done") return noop;
  if (state.stage !== "archiving") {
    throw new Error(
      `harness stage is ${state.stage} — advance to archiving before archive (${change})`,
    );
  }
  const next: HarnessState = {
    ...state,
    stage: "done",
    history: [
      ...state.history,
      { at: nowIso(), from: "archiving", to: "done", op: "advance", note },
    ],
  };
  fs.writeFileSync(p, formatJson(next));
  return { completed: true, restore: () => fs.writeFileSync(p, original) };
}

/**
 * Archive blockers derived from harness verdicts.
 *
 * // Covers: req~harness-archive-gate~1
 */
export function harnessArchiveBlockers(projectPath: string, change: string): string[] {
  const state = readHarness(projectPath, change);
  if (!state) {
    return [`missing harness.json — run \`speclaw cortex start --change ${change}\``];
  }
  const blockers: string[] = [];
  if (state.verdicts.test !== "PASS") {
    blockers.push(`harness test verdict is not PASS (got ${String(state.verdicts.test)})`);
  }
  if (state.level >= 1 && state.verdicts.review !== "PASS") {
    blockers.push(`harness review verdict is not PASS (got ${String(state.verdicts.review)})`);
  }
  if (state.stage !== "archiving" && state.stage !== "done") {
    blockers.push(`harness stage is ${state.stage} — advance to archiving before archive`);
  }
  return blockers;
}
