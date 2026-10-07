/**
 * Per-change status summary for Cortex `status`: stage, active role, time in
 * stage, task progress, rework, pending verdicts, and the configured interval
 * at which the coordinator posts status updates.
 *
 * Cortex must not import from the lawbook module, so task checkboxes and the
 * `cortex.statusIntervalMinutes` key are read with local text scans, like
 * `readCompassGateMode`.
 */

import fs from "node:fs";
import path from "node:path";
import { briefForStage } from "./brief.js";
import { stageStartedAt } from "./compass-gate.js";
import type { HarnessStage, HarnessState } from "./types.js";
import { OUTPUT_BUDGET, estimateTokens } from "../../shared/output-budget.js";
import { resolveChangeDir } from "./paths.js";

/** Interval used when the key is missing or invalid. */
export const DEFAULT_STATUS_INTERVAL_MINUTES = 5;

/**
 * Largest interval reported. A session timer is a cron expression, and
 * an every-N-minutes step only exists for N ≤ 59; 60 is the hourly ping.
 */
export const MAX_STATUS_INTERVAL_MINUTES = 60;

/** Compact, structured status of one Cortex run, plus a one-line rendering. */
export interface CortexStatusSummary {
  change: string;
  stage: HarnessStage;
  /** Role that `brief` maps the stage to; null at `done`. */
  role: string | null;
  /** ISO start of the current stage, or null when no history entry matched. */
  stageStartedAt: string | null;
  /** Whole minutes since `stageStartedAt` (never negative), or null. */
  elapsedMinutes: number | null;
  /** Checkbox counts of `tasks.md` (or level-0 `record.md`); null when neither exists. */
  tasks: { done: number; total: number } | null;
  iteration: number;
  maxRework: number;
  /** Verdicts still owed before archive, in `review`, `test` order. */
  pendingVerdicts: Array<"review" | "test">;
  openQuestions: number;
  /** `cortex.statusIntervalMinutes` from `lawbook/config.yaml`; 0 disables updates. */
  statusIntervalMinutes: number;
  /** English one-line rendering; the coordinator localizes from the fields. */
  line: string;
}

const CHECKBOX = /^\s*[-*]\s+\[( |x|X)\]/;

/**
 * Count Markdown task-list items (`- [ ]`, `- [x]`, `* [X]`). Brackets outside
 * a list item are ignored. This is a line scan, not a Markdown parser: items
 * inside fenced code blocks are counted, and `+` bullets and numbered
 * (`1. [ ]`) items are not.
 *
 * @param text - Markdown source.
 * @returns Checked and total item counts.
 */
export function countTaskCheckboxes(text: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const lineText of text.split(/\r?\n/)) {
    const m = CHECKBOX.exec(lineText);
    if (!m) continue;
    total++;
    if (m[1] !== " ") done++;
  }
  return { done, total };
}

/**
 * Read `statusIntervalMinutes` from the top-level `cortex:` block of
 * `lawbook/config.yaml`. Quotes and a trailing comment are allowed. A missing
 * file, block, or key, or any value that is not a whole number ≥ 0, yields 5.
 * Values above 60 are clamped to 60. Never throws.
 *
 * This is a line scan, not a YAML parser: the key is accepted at any
 * indentation under `cortex:` (nested maps included), and flow style
 * (`cortex: {statusIntervalMinutes: 3}`) is not read, so it yields 5.
 *
 * @param projectPath - Project root.
 *
 * // Covers: req~cortex-status-interval~1
 */
export function readStatusIntervalMinutes(projectPath: string): number {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(projectPath, "lawbook", "config.yaml"), "utf8");
  } catch {
    return DEFAULT_STATUS_INTERVAL_MINUTES;
  }
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => /^cortex:[ \t]*(?:#.*)?$/.test(l));
  if (start < 0) return DEFAULT_STATUS_INTERVAL_MINUTES;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    // The block ends at the next column-0 key; blank and comment lines are skipped.
    if (/^\S/.test(l) && !l.startsWith("#")) break;
    const m = /^\s+statusIntervalMinutes:\s*(\S+)/.exec(l);
    if (!m) continue;
    const value = m[1]!.replace(/#.*$/, "").replace(/^(["'])(.*)\1$/, "$2");
    if (!/^\d+$/.test(value)) return DEFAULT_STATUS_INTERVAL_MINUTES;
    return Math.min(Number(value), MAX_STATUS_INTERVAL_MINUTES);
  }
  return DEFAULT_STATUS_INTERVAL_MINUTES;
}

function readTaskCounts(
  projectPath: string,
  change: string,
): { done: number; total: number } | null {
  // An archived change still reports its tasks from the archive directory.
  const dir =
    resolveChangeDir(projectPath, change)?.dir ??
    path.join(projectPath, "lawbook", "changes", change);
  for (const file of ["tasks.md", "record.md"]) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    return countTaskCheckboxes(text);
  }
  return null;
}

function elapsedSince(startedAt: string | null, now: Date): number | null {
  if (!startedAt) return null;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 60000));
}

/**
 * Build the status summary of a running change from its harness state, its
 * task list, and the configured status interval.
 *
 * @param projectPath - Project root.
 * @param state - Harness state of the change.
 * @param now - Clock for `elapsedMinutes`; injectable for tests.
 * @returns The structured summary and its one-line English rendering.
 *
 * // Covers: req~cortex-status-summary~1
 */
export function buildStatusSummary(
  projectPath: string,
  state: HarnessState,
  now: Date = new Date(),
): CortexStatusSummary {
  const role = briefForStage(state.stage).role;
  const startedAt = stageStartedAt(state);
  const elapsedMinutes = elapsedSince(startedAt, now);
  const tasks = readTaskCounts(projectPath, state.change);
  const pendingVerdicts: Array<"review" | "test"> = [];
  if (state.level >= 1 && state.verdicts.review !== "PASS") pendingVerdicts.push("review");
  if (state.verdicts.test !== "PASS") pendingVerdicts.push("test");
  const openQuestions = state.openQuestions.length;

  const parts = [
    state.change,
    role ? `${state.stage} (${role})` : state.stage,
    elapsedMinutes === null ? "elapsed n/a" : `${elapsedMinutes}m in stage`,
    tasks ? `tasks ${tasks.done}/${tasks.total}` : "tasks n/a",
    `rework ${state.iteration}/${state.maxRework}`,
    `pending: ${pendingVerdicts.length ? pendingVerdicts.join(", ") : "none"}`,
  ];
  if (state.stage === "questions") {
    parts.push(`waiting on human: ${openQuestions} question(s)`);
  }

  return {
    change: state.change,
    stage: state.stage,
    role,
    stageStartedAt: startedAt,
    elapsedMinutes,
    tasks,
    iteration: state.iteration,
    maxRework: state.maxRework,
    pendingVerdicts,
    openQuestions,
    statusIntervalMinutes: readStatusIntervalMinutes(projectPath),
    line: parts.join(" · "),
  };
}

/**
 * A `status` result shaped for a budgeted transport: `summary` first, then,
 * only when history was trimmed, the count of omitted entries, then `state`.
 */
export interface BudgetedStatusResult {
  summary: CortexStatusSummary | null;
  /** Oldest `state.history` entries dropped to fit the budget; absent when none. */
  historyOmitted?: number;
  /** True when even an empty history did not fit and `state` was dropped. */
  stateOmitted?: true;
  state: HarnessState | null;
}

/**
 * Fit a `status` result into the brief MCP output budget without ever cutting
 * `summary`. `text()` truncates a payload from the end, which would yield
 * invalid JSON and lose whatever comes last; this keeps the payload under the
 * budget instead, by dropping the oldest `state.history` entries (newest
 * kept) and recording how many were dropped in `historyOmitted`. If an empty
 * history still does not fit, `state` becomes `null` with `stateOmitted`.
 * Only the MCP rendering is trimmed: `harness.json` and the CLI keep the full
 * history.
 *
 * @param result - The `handleHarness` `status` result.
 * @param maxTokens - Token ceiling; defaults to the brief output budget.
 * @returns A result whose pretty-printed JSON fits `maxTokens`.
 *
 * // Covers: req~cortex-status-summary~1
 */
export function fitStatusResult(
  result: { summary: CortexStatusSummary | null; state: HarnessState | null },
  maxTokens: number = OUTPUT_BUDGET.brief,
): BudgetedStatusResult {
  const fits = (value: BudgetedStatusResult): boolean =>
    estimateTokens(JSON.stringify(value, null, 2)) <= maxTokens;
  const { summary, state } = result;
  const full: BudgetedStatusResult = { summary, state };
  if (!state || fits(full)) return full;

  const history = state.history;
  const keepLast = (k: number): BudgetedStatusResult => ({
    summary,
    historyOmitted: history.length - k,
    state: { ...state, history: k > 0 ? history.slice(-k) : [] },
  });
  // Fitting is monotone in the number of kept entries: binary-search the most.
  let lo = 0;
  let hi = history.length - 1;
  if (!fits(keepLast(0))) return { summary, stateOmitted: true, state: null };
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(keepLast(mid))) lo = mid;
    else hi = mid - 1;
  }
  return keepLast(lo);
}
