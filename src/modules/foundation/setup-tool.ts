import { z } from "zod";
import { loadPacks } from "../tools/packs.js";
import { AGENTS, configureAgent } from "../../shared/agents.js";
import { emptyReport } from "../../shared/install.js";
import { refreshAgents } from "../../shared/agents.js";
import { installPack } from "../tools/packs.js";

/** Human help text for init questionnaire (not embedded in MCP schemas). */
const profileFieldHelp: Record<string, string> = {
  project_name: "Short project name, e.g. the repo name",
  project_description: "One-line description of what the project does",
  organization: "Company/team name",
  stack_summary: "e.g. 'Next.js 15 + TypeScript frontend, FastAPI + PostgreSQL backend'",
  architecture: "e.g. 'hexagonal architecture with bounded contexts'",
  test_commands: "Real commands, e.g. 'pytest backend/tests && npm run test'",
  lint_commands: "Real commands, e.g. 'ruff check . && npm run lint && tsc --noEmit'",
  branch_pattern: "e.g. 'feature/<ticket-id>-<slug>'",
  commit_style: "e.g. 'conventional commits, imperative, English'",
  custom_laws: "Extra markdown for LAWS.md — project-specific binding rules",
  compass_hints: "Markdown bullets with real entrypoints for docs/compass.md",
  base_standards_extra: "Extra cross-cutting rules for base-standards.md",
  modules_table: "Markdown table of modules/bounded contexts",
  layering_rules: "Layers and allowed dependencies for architecture.md",
  backend_layers: "Backend layer table for backend-standards.md",
  frontend_layers: "Frontend layer table for frontend-standards.md",
  versioning_rules: "Versioning/release convention for conventions.md",
  documentation_extra: "Repo-specific docstring notes for documentation.md",
};

const profileShape = {
  project_name: z.string(),
  project_description: z.string().optional(),
  organization: z.string().optional(),
  stack_summary: z.string().optional(),
  architecture: z.string().optional(),
  test_commands: z.string().optional(),
  lint_commands: z.string().optional(),
  branch_pattern: z.string().optional(),
  commit_style: z.string().optional(),
  custom_laws: z.string().optional(),
  compass_hints: z.string().optional(),
  base_standards_extra: z.string().optional(),
  modules_table: z.string().optional(),
  layering_rules: z.string().optional(),
  backend_layers: z.string().optional(),
  frontend_layers: z.string().optional(),
  versioning_rules: z.string().optional(),
  documentation_extra: z.string().optional(),
};

export const setupActions = ["init", "configure-agent", "add-pack", "list-packs"] as const;

export type SetupAction = (typeof setupActions)[number];

export const speclawSetupSchema = {
  projectPath: z.string(),
  action: z.enum(setupActions),
  agent: z.enum(AGENTS.map((a) => a.id) as [string, ...string[]]).optional(),
  pack: z.string().optional(),
  vars: z.record(z.string()).optional(),
};

type SetupArgs = {
  projectPath: string;
  action: SetupAction;
  agent?: string;
  pack?: string;
  vars?: Record<string, string>;
};

/**
 * Dispatch `speclaw_setup` by action. Scaffold is CLI-only — not exposed here.
 *
 * @param args - Setup action and parameters.
 */
export function handleSpeclawSetup(args: SetupArgs): unknown {
  switch (args.action) {
    case "init":
      return {
        instructions: [
          "1. Analyze the repository at projectPath and fill profile fields from the real codebase.",
          "2. Call speclaw_setup with action configure-agent / add-pack as needed.",
          "3. Run lawbook_change action init and compass_index when scaffold completes via CLI if needed.",
        ],
        profileFields: profileFieldHelp,
        packs: loadPacks(),
        note: "Full scaffold runs via CLI: speclaw init — not MCP.",
      };
    case "configure-agent": {
      if (!args.agent) throw new Error(`speclaw_setup: action 'configure-agent' requires 'agent'`);
      const report = emptyReport();
      configureAgent(args.projectPath, args.agent, report);
      return report;
    }
    case "list-packs":
      return loadPacks();
    case "add-pack": {
      if (!args.pack) throw new Error(`speclaw_setup: action 'add-pack' requires 'pack'`);
      const report = emptyReport();
      installPack(args.projectPath, args.pack, args.vars ?? {}, report);
      refreshAgents(args.projectPath, report);
      return report;
    }
    default:
      throw new Error(`speclaw_setup: unknown action '${String(args.action)}'`);
  }
}

/** Zod profile shape for CLI scaffold (not in MCP schema). */
export { profileShape as setupProfileShape };
