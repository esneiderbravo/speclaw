import type { Law } from "../laws.js";
import {
  type CompileContext,
  type CompiledArtifact,
  type Dialect,
  frontmatter,
  lawSlug,
} from "./types.js";

/**
 * Copilot path-scoped instructions. Scoped laws only — never also dump the
 * same body into AGENTS (dual-read nondeterminism).
 */
export const copilotDialect: Dialect = {
  id: "copilot-instructions",
  compile(laws: Law[], ctx: CompileContext): CompiledArtifact[] {
    // Emit when explicitly wanted: agent id "copilot" or always if .github exists —
    // orchestrator passes agents; treat missing copilot as skip unless "agents" generic.
    const want =
      ctx.agents.includes("copilot") ||
      ctx.agents.includes("github-copilot") ||
      ctx.agents.includes("agents");
    if (!want) return [];
    const scoped = laws.filter((l) => (l.status ?? "active") !== "draft" && l.scope.length > 0);
    return scoped.map((law) => {
      const fm = frontmatter({ applyTo: law.scope.join(",") });
      const body = [
        `# ${law.title}`,
        "",
        `<!-- speclaw:law-id ${law.id} -->`,
        "",
        law.prose,
        "",
      ].join("\n");
      return {
        path: `.github/instructions/${lawSlug(law.id)}.instructions.md`,
        contents: fm + body,
        lawIds: [law.id],
        mode: "write" as const,
      };
    });
  },
};
