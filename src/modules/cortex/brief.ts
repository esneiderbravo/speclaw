/**
 * Stage → role brief for Cortex coordinators.
 *
 * // Covers: req~cortex-module~1
 */

import type { HarnessStage } from "./harness.js";

export interface CortexBrief {
  role: string | null;
  agentPath: string | null;
  skillHints: string[];
  nextOps: string[];
}

/**
 * Map a harness stage to the role the coordinator should dispatch.
 *
 * @param stage - Current harness stage, or null when not started.
 */
export function briefForStage(stage: HarnessStage | null): CortexBrief {
  switch (stage) {
    case "exploring":
      return {
        role: "explorer",
        agentPath: "ai-specs/agents/explorer.md",
        skillHints: ["explore"],
        nextOps: ["advance"],
      };
    case "planning":
      return {
        role: "planner",
        agentPath: "ai-specs/agents/planner.md",
        skillHints: ["draft"],
        nextOps: ["advance", "pauseForQuestions"],
      };
    case "questions":
      return {
        role: "planner",
        agentPath: "ai-specs/agents/planner.md",
        skillHints: ["draft"],
        nextOps: ["advance"],
      };
    case "implementing":
      return {
        role: "implementer",
        agentPath: "ai-specs/agents/implementer.md",
        skillHints: ["build"],
        nextOps: ["advance"],
      };
    case "reviewing":
      return {
        role: "reviewer",
        agentPath: "ai-specs/agents/reviewer.md",
        skillHints: [],
        nextOps: ["advance", "rework"],
      };
    case "testing":
      return {
        role: "tester",
        agentPath: "ai-specs/agents/tester.md",
        skillHints: ["test"],
        nextOps: ["advance", "rework"],
      };
    case "archiving":
      return {
        role: "archiver",
        agentPath: "ai-specs/agents/archiver.md",
        skillHints: ["sync", "archive"],
        nextOps: ["advance"],
      };
    case "done":
    case null:
      return {
        role: null,
        agentPath: null,
        skillHints: [],
        nextOps: [],
      };
    default: {
      const _exhaustive: never = stage;
      throw new Error(`unknown stage ${String(_exhaustive)}`);
    }
  }
}
