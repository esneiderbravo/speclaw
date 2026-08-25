import type { Law } from "../laws.js";
import { type CompileContext, type CompiledArtifact, type Dialect } from "./types.js";

/**
 * CodeRabbit: emit a merge artifact describing path_instructions entries.
 * The orchestrator merges into existing YAML without a full YAML parser —
 * marker-based line surgery on `path_instructions:` list items.
 */
export const coderabbitDialect: Dialect = {
  id: "coderabbit",
  compile(laws: Law[], ctx: CompileContext): CompiledArtifact[] {
    if (!ctx.agents.includes("coderabbit")) return [];
    const active = laws.filter((l) => (l.status ?? "active") !== "draft" && l.scope.length > 0);
    if (active.length === 0) return [];
    const entries = active.map((law) => ({
      path: law.scope[0] ?? "**",
      instructions: `[speclaw:${law.id}] ${law.prose}`,
    }));
    return [
      {
        path: ".coderabbit.yaml",
        contents: JSON.stringify({ path_instructions: entries }, null, 2) + "\n",
        lawIds: active.map((l) => l.id),
        mode: "merge-yaml-path-instructions",
      },
    ];
  },
};
