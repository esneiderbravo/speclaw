/**
 * Compass-first evidence gate for Cortex `advance`.
 *
 * Leaving `exploring` or `implementing` requires (strict) or recommends (warn)
 * at least one Compass evidence call in the shared call log since the current
 * stage started. Cortex must not import from the lawbook module, so the
 * `compassGate` key is read with a local regex scan of `lawbook/config.yaml`.
 *
 * // Covers: req~compass-evidence-gate~1
 */

import fs from "node:fs";
import path from "node:path";
import { EVIDENCE_TOOLS, countEvidence, readCompassCalls } from "../../shared/compass-calls.js";
import type { HarnessStage, HarnessState } from "./types.js";

/** `compassGate` modes in `lawbook/config.yaml`. */
export type CompassGateMode = "off" | "warn" | "strict";

/** Mode used when the key is missing or invalid. */
export const DEFAULT_COMPASS_GATE: CompassGateMode = "warn";

/** Stages whose exit is gated. */
export const GATED_STAGES: ReadonlySet<HarnessStage> = new Set(["exploring", "implementing"]);

/** Gate outcome returned on every gated advance. */
export interface CompassEvidence {
  mode: CompassGateMode;
  stage: HarnessStage;
  /** ISO start of the stage window, or null when no history entry matched. */
  since: string | null;
  /** Evidence calls at or after `since`. */
  calls: number;
}

/** {@link CompassEvidence} plus whether the gate is satisfied. */
export interface CompassGateResult extends CompassEvidence {
  satisfied: boolean;
}

const GATE_KEY = /^compassGate:[ \t]*(["']?)([A-Za-z]*)\1[ \t]*(?:#.*)?$/m;

/**
 * Read the top-level `compassGate` key from `lawbook/config.yaml`.
 *
 * Quotes are optional and a trailing comment is allowed. A missing file or
 * key, or any value other than `off`/`warn`/`strict`, yields `warn`.
 *
 * @param projectPath - Project root.
 */
export function readCompassGateMode(projectPath: string): CompassGateMode {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(projectPath, "lawbook", "config.yaml"), "utf8");
  } catch {
    return DEFAULT_COMPASS_GATE;
  }
  const value = GATE_KEY.exec(raw)?.[2];
  return value === "off" || value === "warn" || value === "strict" ? value : DEFAULT_COMPASS_GATE;
}

/**
 * When the current stage started: the `at` of the newest history entry whose
 * `to` is the current stage. `start` enters `exploring` and `rework` enters
 * `implementing`, so a rework restarts the window. Null when none matches.
 *
 * @param state - Harness state.
 */
export function stageStartedAt(state: HarnessState): string | null {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const entry = state.history[i]!;
    if (entry.to === state.stage) return entry.at;
  }
  return null;
}

/**
 * Count Compass evidence calls since the current stage started.
 *
 * Reads only the bounded call-log tail. With no matching history entry every
 * log entry is eligible.
 *
 * @param projectPath - Project root.
 * @param state - Harness state before the advance.
 * @param mode - Gate mode; defaults to {@link readCompassGateMode}.
 */
export function evaluateCompassGate(
  projectPath: string,
  state: HarnessState,
  mode: CompassGateMode = readCompassGateMode(projectPath),
): CompassGateResult {
  const since = stageStartedAt(state);
  const sinceMs = since === null ? Number.NaN : Date.parse(since);
  const calls = countEvidence(
    readCompassCalls(projectPath, Number.isNaN(sinceMs) ? {} : { sinceMs }),
  );
  return { mode, stage: state.stage, since, calls, satisfied: calls > 0 };
}

function evidenceToolList(): string {
  return [...EVIDENCE_TOOLS].join(", ");
}

/** Error text for a strict rejection. */
export function compassGateError(result: CompassEvidence): string {
  return (
    `compass-first: cannot leave stage "${result.stage}" — no Compass evidence call ` +
    `(${evidenceToolList()}) since ${result.since ?? "the stage started"}. ` +
    `Locate and read the code with compass_find / compass_explore first, ` +
    `or relax compassGate (off|warn) in lawbook/config.yaml.`
  );
}

/** Warning text for a warn-mode advance without evidence. */
export function compassGateWarning(result: CompassEvidence): string {
  return (
    `compass-first: left stage "${result.stage}" with no Compass evidence call ` +
    `(${evidenceToolList()}) since ${result.since ?? "the stage started"}. ` +
    `Set compassGate: strict in lawbook/config.yaml to enforce.`
  );
}
