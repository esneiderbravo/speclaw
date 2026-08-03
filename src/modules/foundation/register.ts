import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { text } from "../../shared/mcp.js";
import { scaffold } from "./scaffold.js";
import { doctor } from "./doctor.js";
import { loadPacks } from "../tools/packs.js";
import { AGENTS, configureAgent } from "../../shared/agents.js";
import { emptyReport } from "../../shared/install.js";

const profileShape = {
  project_name: z.string().describe("Short project name, e.g. the repo name"),
  project_description: z.string().optional().describe("One-line description of what the project does"),
  organization: z.string().optional().describe("Company/team name"),
  stack_summary: z.string().optional().describe("e.g. 'Next.js 15 + TypeScript frontend, FastAPI + PostgreSQL backend'"),
  architecture: z.string().optional().describe("e.g. 'hexagonal architecture with bounded contexts'"),
  test_commands: z.string().optional().describe("Real commands, e.g. 'pytest backend/tests && npm run test'"),
  lint_commands: z.string().optional().describe("Real commands, e.g. 'ruff check . && npm run lint && tsc --noEmit'"),
  branch_pattern: z.string().optional().describe("e.g. 'feature/<ticket-id>-<slug>'"),
  commit_style: z.string().optional().describe("e.g. 'conventional commits, imperative, English'"),
  custom_laws: z.string().optional().describe("Extra markdown appended to LAWS.md — project-specific binding rules the analysis surfaced"),
  ticket_prefix: z.string().optional().describe("Ticket prefix in the team's tracker, e.g. 'FAR'"),
  team_language: z.string().optional().describe("The team's working language for posted communication (reviews, replies, tickets), e.g. 'Spanish'. Repo artifacts stay in the repo's own language. Defaults to English."),
  compass_hints: z.string().optional().describe("Markdown bullets with the repo's real entrypoints and common traces, inserted into docs/compass.md"),
  base_standards_extra: z.string().optional().describe("Markdown with any project-specific cross-cutting rules, appended to docs/standards/base-standards.md"),
  modules_table: z.string().optional().describe("Markdown table of the repo's real modules/bounded contexts + one-line responsibility, for docs/standards/architecture.md"),
  layering_rules: z.string().optional().describe("Markdown describing the layers and their allowed dependencies, for docs/standards/architecture.md"),
  backend_layers: z.string().optional().describe("Markdown layer table (Layer | File | Responsibility) from the real backend, for docs/standards/backend-standards.md"),
  frontend_layers: z.string().optional().describe("Markdown layer table from the real frontend, for docs/standards/frontend-standards.md"),
  versioning_rules: z.string().optional().describe("The repo's versioning/release convention, for docs/standards/conventions.md"),
  documentation_extra: z.string().optional().describe("Repo-specific docstring notes (keep only the languages used, the enforced linter), appended to docs/standards/documentation.md"),
};

// ─── The foundation module: analyze the repo, then write the constitution ───

/** Register the foundation MCP tools (init_project, scaffold, configure_agent, doctor). */
export function registerFoundation(server: McpServer): void {
  server.registerTool(
    "init_project",
    {
      description:
        "START HERE to initialize speclaw in a project. Returns the analysis questionnaire the agent must answer by reading the target repo, plus the available skill packs. Do NOT guess answers — investigate the codebase (package.json, pyproject.toml, CI config, existing docs) and confirm the pack selection with the user before calling scaffold.",
      inputSchema: { projectPath: z.string().describe("Absolute path to the project to initialize") },
    },
    async () => {
      const packs = loadPacks();
      return text({
        instructions: [
          "1. Analyze the repository at projectPath and fill in every profile field below with REAL values from the codebase (read package.json / pyproject.toml / CI configs / README — do not invent).",
          "2. The foundation is a set of GRANULAR standards under docs/standards/ (base, architecture, backend, frontend, testing, conventions, spec-workflow), bound by LAWS.md and referenced from CLAUDE.md/AGENTS.md. Fill their structured fields from the real repo: modules_table and layering_rules (architecture), backend_layers, frontend_layers, versioning_rules, and any base_standards_extra. Omit a field only when that standard genuinely doesn't apply to this stack.",
          "3. Suggest packs: add stack packs whose 'detect' hints match dependencies you found; offer the rest. Ask the user which packs to install (the spec workflow is always installed).",
          "4. If the 'workflow' pack is selected, ask the user for their tracker's ticket prefix and team working language.",
          "5. Draft any custom_laws (extra binding rules for LAWS.md) from conventions you observed that the standard set doesn't cover.",
          "6. Call the 'scaffold' tool with { projectPath, profile, packs }.",
          "7. Follow the nextSteps returned by scaffold: complete the HTML-comment sections still left in docs/standards/*, then run the lawbook_init and compass_index tools (both built into speclaw — no external installs).",
        ],
        profileFields: Object.fromEntries(
          Object.entries(profileShape).map(([key, schema]) => [key, schema.description ?? ""])
        ),
        packs,
      });
    }
  );

  server.registerTool(
    "scaffold",
    {
      description:
        "Write the speclaw setup into a project: the foundation (LAWS.md constitution + granular docs/standards/* + CLAUDE.md + AGENTS.md + docs/compass.md), the spec workflow (always), the selected tool packs, multi-IDE symlinks (.claude/.cursor/.codex/.agents), .mcp.json wiring for speclaw, and .gitignore for .speclaw/. Never overwrites existing files. Call init_project first.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        profile: z.object(profileShape).describe("Project profile gathered by analyzing the repo"),
        packs: z.array(z.string()).describe("Optional tool pack names (quality, workflow, agents)"),
        agents: z.array(z.string()).optional().describe(`Agent ids to configure (symlinks + MCP): ${AGENTS.map((a) => a.id).join(", ")}. Usually the CLI handles this; omit to write content only.`),
      },
    },
    async ({ projectPath, profile, packs, agents }) => text(scaffold(projectPath, profile, packs, agents ?? []))
  );

  server.registerTool(
    "configure_agent",
    {
      description:
        "Configure one agent's integration in an already-scaffolded project: create its IDE symlinks into ai-specs and register the speclaw MCP server in its config. Re-runnable; add agents one at a time.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        agent: z.enum(AGENTS.map((a) => a.id) as [string, ...string[]]).describe("Agent id to configure"),
      },
    },
    async ({ projectPath, agent }) => {
      const report = emptyReport();
      configureAgent(projectPath, agent, report);
      return text(report);
    }
  );

  server.registerTool(
    "doctor",
    {
      description:
        "Verify a speclaw installation: ai-specs presence, the foundation (LAWS.md + standards + agent contracts), IDE symlinks health, the lawbook/ workflow, the Compass index, and .mcp.json wiring. Returns a checklist with remediation hints.",
      inputSchema: { projectPath: z.string().describe("Absolute path to the project") },
    },
    async ({ projectPath }) => {
      const checks = doctor(projectPath);
      const failed = checks.filter((c) => !c.ok);
      return text({
        healthy: failed.length === 0,
        checks,
        summary: failed.length === 0
          ? "Everything is within the law."
          : `${failed.length} check(s) failed — see details.`,
      });
    }
  );
}
