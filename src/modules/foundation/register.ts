import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { scaffold } from "./scaffold.js";
import { doctor } from "./doctor.js";
import { checkAction, CheckEvent } from "./check.js";
import { BatchEngine, verifyLaws } from "./verify.js";
import { loadPacks } from "../tools/packs.js";
import { AGENTS, configureAgent } from "../../shared/agents.js";
import { emptyReport } from "../../shared/install.js";

/** Human help text for init_project's questionnaire (not embedded in MCP schemas). */
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

/** Lean Zod shape for scaffold — no .describe() text (that cost rides in every request). */
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

/** Register foundation MCP tools. */
export function registerFoundation(server: McpServer, opts: RegisterOpts = {}): void {
  const minimal = Boolean(opts.minimal);
  const add = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: Shape,
    handler: ToolSpec<Shape>["handler"],
  ) => {
    if (!shouldExpose(name, minimal)) return;
    defineTool(server, { name, description, inputSchema, handler });
  };

  add(
    "init_project",
    "Start here to initialize speclaw: returns the analysis questionnaire and packs.",
    { projectPath: z.string() },
    async () => {
      const packs = loadPacks();
      return text({
        instructions: [
          "1. Analyze the repository at projectPath and fill in every profile field below with REAL values from the codebase (read package.json / pyproject.toml / CI configs / README — do not invent).",
          "2. The foundation is a set of GRANULAR standards under docs/standards/ (base, architecture, backend, frontend, testing, conventions, lawbook), bound by LAWS.md and referenced from CLAUDE.md/AGENTS.md. Fill their structured fields from the real repo: modules_table and layering_rules (architecture), backend_layers, frontend_layers, versioning_rules, and any base_standards_extra. Omit a field only when that standard genuinely doesn't apply to this stack.",
          "3. Suggest packs: add stack packs whose 'detect' hints match dependencies you found; offer the rest. Ask the user which packs to install (the lawbook workflow is always installed).",
          "4. Infer the working language and the branch/commit/tracker conventions from the repo itself — the language already used in docstrings, commit messages, branch names, and PR/ticket bodies. Do NOT ask the user or assume English; match what the repo does, and set branch_pattern/commit_style accordingly. speclaw does not prescribe a ticket tool — leave tracker linkage to the team's own convention.",
          "5. Draft any custom_laws (extra binding rules for LAWS.md) from conventions you observed that the standard set doesn't cover.",
          "6. Call the 'scaffold' tool with { projectPath, profile, packs }.",
          "7. Follow the nextSteps returned by scaffold: complete the HTML-comment sections still left in docs/standards/*, then run the lawbook_init and compass_index tools (both built into speclaw — no external installs).",
        ],
        profileFields: profileFieldHelp,
        packs,
      });
    },
  );

  add(
    "scaffold",
    "Write foundation, lawbook workflow, packs, IDE symlinks, and .mcp.json. Never overwrites.",
    {
      projectPath: z.string(),
      profile: z.object(profileShape),
      packs: z.array(z.string()),
      agents: z.array(z.string()).optional(),
    },
    async ({ projectPath, profile, packs, agents }) =>
      text(scaffold(projectPath, profile, packs, agents ?? [])),
  );

  add(
    "configure_agent",
    "Add one agent's IDE symlinks and MCP config to an already-scaffolded project.",
    {
      projectPath: z.string(),
      agent: z.enum(AGENTS.map((a) => a.id) as [string, ...string[]]),
    },
    async ({ projectPath, agent }) => {
      const report = emptyReport();
      configureAgent(projectPath, agent, report);
      return text(report);
    },
  );

  add(
    "speclaw_check",
    "Invoked by speclaw's hooks to enforce laws — do not call directly.",
    {
      projectPath: z.string(),
      event: z.enum(["PreToolUse", "PostToolUse", "Stop", "InstructionsLoaded"]),
      toolName: z.string().optional(),
      payload: z.record(z.unknown()),
    },
    async ({ projectPath, event, toolName, payload }) =>
      text(checkAction({ projectPath, event: event as CheckEvent, toolName, payload })),
  );

  add(
    "law_verify",
    "Verify deterministic deps/graph laws and return violations by file.",
    {
      projectPath: z.string(),
      paths: z.array(z.string()).optional(),
      engines: z.array(z.enum(["deps", "graph"])).optional(),
      lawIds: z.array(z.string()).optional(),
    },
    async ({ projectPath, paths, engines, lawIds }) =>
      text(
        verifyLaws({ projectPath, paths, engines: engines as BatchEngine[] | undefined, lawIds }),
      ),
  );

  add(
    "doctor",
    "Verify the speclaw install; returns a versioned DoctorReport (schemaVersion 1).",
    { projectPath: z.string() },
    async ({ projectPath }) => {
      const report = await doctor(projectPath, { redact: true });
      return text(report);
    },
  );
}
