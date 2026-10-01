/**
 * Deterministic multi-agent harness state for a lawbook change.
 *
 * Speclaw does not spawn LLMs. This module only persists stage transitions;
 * the host agent (Cursor/Claude/…) follows the Cortex skill and calls these
 * ops via `speclaw cortex` or the `cortex` MCP tool.
 *
 * Cortex must not import from the lawbook module (no cycles). Ceremony level
 * is read locally from `change.json` `confirmedLevel` (default 3).
 */

import fs from "node:fs";
import path from "node:path";

/** Confirmed ceremony level (mirrors lawbook; kept local to avoid cycles). */
export type CeremonyLevel = 0 | 1 | 2 | 3;

export const HARNESS_STAGES = [
  "exploring",
  "planning",
  "questions",
  "implementing",
  "reviewing",
  "testing",
  "archiving",
  "done",
] as const;

export type HarnessStage = (typeof HARNESS_STAGES)[number];

export type HarnessVerdict = "PASS" | "FAIL" | null;

export interface HarnessHistoryEntry {
  at: string;
  from: HarnessStage;
  to: HarnessStage;
  op: "start" | "advance" | "rework";
  note?: string;
}

export interface HarnessState {
  version: 1;
  change: string;
  stage: HarnessStage;
  level: CeremonyLevel;
  iteration: number;
  maxRework: number;
  verdicts: { review: HarnessVerdict; test: HarnessVerdict };
  openQuestions: string[];
  history: HarnessHistoryEntry[];
}

export const harnessOps = ["status", "start", "advance", "rework"] as const;
export type HarnessOp = (typeof harnessOps)[number];

const DEFAULT_MAX_REWORK = 3;

function specRoot(projectPath: string): string {
  return path.join(projectPath, "lawbook");
}

function changeDir(projectPath: string, change: string): string {
  return path.join(specRoot(projectPath), "changes", change);
}

function harnessPath(projectPath: string, change: string): string {
  return path.join(changeDir(projectPath, change), "harness.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireChangeDir(projectPath: string, change: string): string {
  const dir = changeDir(projectPath, change);
  if (!fs.existsSync(dir)) {
    throw new Error(`change "${change}" not found under lawbook/changes/`);
  }
  return dir;
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
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + "\n");
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
  /** planning → questions without a "to" field: use goToQuestions */
  pauseForQuestions?: boolean;
};

/**
 * Dispatch a harness op for a change.
 *
 * // Covers: req~harness-state~1
 */
export function handleHarness(
  args: HarnessHandleArgs,
): HarnessState | { state: HarnessState | null } {
  const { projectPath, change, harnessOp } = args;
  requireChangeDir(projectPath, change);

  if (harnessOp === "status") {
    return { state: readHarness(projectPath, change) };
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

  if (harnessOp === "advance") {
    // Planner may pause for questions instead of advancing to implement.
    if (current.stage === "planning" && args.pauseForQuestions) {
      const questions = args.openQuestions ?? [];
      if (questions.length === 0) {
        throw new Error(`pauseForQuestions requires at least one openQuestions entry`);
      }
      const next: HarnessState = {
        ...current,
        stage: "questions",
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

    const to = allowedAdvance(current.stage, current.level, args.verdict ?? undefined);
    const verdicts = { ...current.verdicts };
    if (current.stage === "reviewing" && args.verdict) verdicts.review = args.verdict;
    if (current.stage === "testing" && args.verdict) verdicts.test = args.verdict;

    const next: HarnessState = {
      ...current,
      stage: to,
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
    return next;
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
