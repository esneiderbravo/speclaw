import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { assetsDir } from "../../shared/paths.js";
import { copyRendered, CopyOpts, InstallReport } from "../../shared/install.js";
import { specInit, specValidate, specSync, specArchive, specList } from "./engine.js";
import { buildCoverageReport, loadCoverageConfig, renderCoverageAgent } from "./coverage.js";

const ASSETS = assetsDir(import.meta.url);

/**
 * Install the spec module's workflow interface into a project's ai-specs/:
 * the draft/build/sync/archive/explore skills, the /spec commands, and the
 * mandatory-task-steps rule. Always installed — it's the core workflow.
 */
export function installWorkflow(
  projectPath: string,
  vars: Record<string, string | undefined>,
  report: InstallReport,
  opts?: CopyOpts,
): void {
  const aiSpecs = path.join(projectPath, "ai-specs");
  copyRendered(path.join(ASSETS, "skills"), path.join(aiSpecs, "skills"), vars, report, opts);
  copyRendered(
    path.join(ASSETS, "commands"),
    path.join(aiSpecs, "commands", "lawbook"),
    vars,
    report,
    opts,
  );
  copyRendered(path.join(ASSETS, "rules"), path.join(aiSpecs, "rules"), vars, report, opts);
}

/** Register the spec workflow MCP tools (init, list, validate, sync, archive). */
export function registerSpec(server: McpServer, opts: RegisterOpts = {}): void {
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
    "lawbook_init",
    "Create the lawbook/ workspace (specs, changes, archive, config). Idempotent.",
    { projectPath: z.string() },
    async ({ projectPath }) => text(specInit(projectPath)),
  );

  add(
    "lawbook_list",
    "List active changes, archives, and canonical capabilities under lawbook/.",
    { projectPath: z.string() },
    async ({ projectPath }) => text(specList(projectPath)),
  );

  add(
    "lawbook_validate",
    "Validate a change's proposal, tasks, and delta specs before build or sync.",
    { projectPath: z.string(), change: z.string() },
    async ({ projectPath, change }) => text(specValidate(projectPath, change)),
  );

  add(
    "lawbook_sync",
    "Promote a change's delta specs into canonical lawbook/specs/ without archiving.",
    { projectPath: z.string(), change: z.string() },
    async ({ projectPath, change }) => text(specSync(projectPath, change)),
  );

  add(
    "lawbook_archive",
    "Sync a change into canonical specs, then move it under changes/archive/.",
    {
      projectPath: z.string(),
      change: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    async ({ projectPath, change, date }) => text(specArchive(projectPath, change, date)),
  );

  add(
    "lawbook_coverage",
    "Report which requirements lack impl/test coverage before declaring work done.",
    {
      projectPath: z.string(),
      change: z.string().optional(),
      onlyDefects: z.boolean().optional(),
      json: z.boolean().optional(),
    },
    async ({ projectPath, change, onlyDefects, json }) => {
      const cfg = loadCoverageConfig(projectPath);
      const report = buildCoverageReport(projectPath, { change, cfg });
      if (json) return text(JSON.stringify(report));
      return text(renderCoverageAgent(report, onlyDefects !== false));
    },
  );
}
