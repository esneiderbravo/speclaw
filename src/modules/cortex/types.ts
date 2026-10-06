/**
 * Harness state types shared by `harness.ts` and `compass-gate.ts`. A leaf
 * module: it imports nothing, so neither consumer forms an import cycle.
 */

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
