import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { text } from "../../shared/mcp.js";
import { assetsDir } from "../../shared/paths.js";
import { copyRendered, InstallReport } from "../../shared/install.js";
import { specInit, specValidate, specSync, specArchive, specList } from "./engine.js";

const ASSETS = assetsDir(import.meta.url);

/**
 * Install the spec module's workflow interface into a project's ai-specs/:
 * the draft/build/sync/archive/explore skills, the /spec commands, and the
 * mandatory-task-steps rule. Always installed — it's the core workflow.
 */
export function installWorkflow(
  projectPath: string,
  vars: Record<string, string | undefined>,
  report: InstallReport
): void {
  const aiSpecs = path.join(projectPath, "ai-specs");
  copyRendered(path.join(ASSETS, "skills"), path.join(aiSpecs, "skills"), vars, report);
  copyRendered(path.join(ASSETS, "commands"), path.join(aiSpecs, "commands", "lawbook"), vars, report);
  copyRendered(path.join(ASSETS, "rules"), path.join(aiSpecs, "rules"), vars, report);
}

// ─── The spec module: speclaw's own spec-driven workflow (no external OpenSpec) ───
// Mechanical operations behind the draft/build/sync/archive/explore commands.

/** Register the spec workflow MCP tools (init, list, validate, sync, archive). */
export function registerSpec(server: McpServer): void {
  server.registerTool(
    "lawbook_init",
    {
      description:
        "Initialize speclaw's spec-driven workflow in a project: creates lawbook/ (specs/, changes/, changes/archive/, config.yaml, README). Idempotent — never overwrites existing files.",
      inputSchema: { projectPath: z.string().describe("Absolute path to the project") },
    },
    async ({ projectPath }) => text(specInit(projectPath))
  );

  server.registerTool(
    "lawbook_list",
    {
      description:
        "List the spec workspace: active changes, archived changes, and canonical capabilities under spec/.",
      inputSchema: { projectPath: z.string().describe("Absolute path to the project") },
    },
    async ({ projectPath }) => text(specList(projectPath))
  );

  server.registerTool(
    "lawbook_validate",
    {
      description:
        "Validate a change's artifacts: proposal.md and tasks.md present, and delta specs use normative language (SHALL/MUST), '### Requirement:' headers, and '#### Scenario:' acceptance criteria. Returns the issues to fix. Used by the draft/build commands before proceeding.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        change: z.string().describe("Change name (folder under lawbook/changes/)"),
      },
    },
    async ({ projectPath, change }) => text(specValidate(projectPath, change))
  );

  server.registerTool(
    "lawbook_sync",
    {
      description:
        "Promote a change's delta specs into the canonical lawbook/specs/ (per capability), without archiving. Backs the `sync` command.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        change: z.string().describe("Change name (folder under lawbook/changes/)"),
      },
    },
    async ({ projectPath, change }) => text(specSync(projectPath, change))
  );

  server.registerTool(
    "lawbook_archive",
    {
      description:
        "Finalize a change: sync its delta specs into lawbook/specs/, then move it to lawbook/changes/archive/<date>-<name>/. Backs the `archive` command. Pass today's date as YYYY-MM-DD.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        change: z.string().describe("Change name (folder under lawbook/changes/)"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Today's date, YYYY-MM-DD"),
      },
    },
    async ({ projectPath, change, date }) => text(specArchive(projectPath, change, date))
  );
}
