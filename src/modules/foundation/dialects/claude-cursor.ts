import type { Law } from "../laws.js";
import {
  type CompileContext,
  type CompiledArtifact,
  type Dialect,
  frontmatter,
  lawSlug,
} from "./types.js";

function body(law: Law): string {
  return [`# ${law.title}`, "", `<!-- speclaw:law-id ${law.id} -->`, "", law.prose, ""].join("\n");
}

/** Claude Code `.claude/rules` via managed `ai-specs/rules/<slug>.md` + `paths:`. */
export const claudeRulesDialect: Dialect = {
  id: "claude-rules",
  compile(laws: Law[], ctx: CompileContext): CompiledArtifact[] {
    if (!ctx.agents.includes("claude")) return [];
    const active = laws.filter((l) => (l.status ?? "active") !== "draft");
    return active.map((law) => {
      const fm = law.scope.length === 0 ? frontmatter({}) : frontmatter({ paths: law.scope });
      return {
        path: `ai-specs/rules/${lawSlug(law.id)}.md`,
        contents: fm + body(law),
        lawIds: [law.id],
        mode: "write" as const,
      };
    });
  },
};

/** Cursor rules as `.mdc` under `ai-specs/rules` (symlinked via `.cursor/rules`). */
export const cursorMdcDialect: Dialect = {
  id: "cursor-mdc",
  compile(laws: Law[], ctx: CompileContext): CompiledArtifact[] {
    if (!ctx.agents.includes("cursor")) return [];
    const active = laws.filter((l) => (l.status ?? "active") !== "draft");
    return active.map((law) => {
      const empty = law.scope.length === 0;
      const fm = frontmatter({
        description: law.title,
        alwaysApply: empty,
        ...(empty ? {} : { globs: law.scope }),
      });
      return {
        path: `ai-specs/rules/${lawSlug(law.id)}.mdc`,
        contents: fm + body(law),
        lawIds: [law.id],
        mode: "write" as const,
      };
    });
  },
};
