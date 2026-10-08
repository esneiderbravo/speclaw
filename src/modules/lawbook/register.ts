import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { assetsDir } from "../../shared/paths.js";
import { copyRendered, CopyOpts, InstallReport } from "../../shared/install.js";
import { investigate, formatInvestigateResult } from "./investigate.js";
import { handleLawbookChange, lawbookChangeSchema } from "./change-tool.js";

const ASSETS = assetsDir(import.meta.url);

/**
 * Install the spec module's workflow interface into a project's ai-specs/.
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
  // Role agents (explorer/planner/implementer/reviewer/tester/archiver) — always on.
  // Covers: req~role-agents-default~1
  const agentsSrc = path.join(ASSETS, "agents");
  if (fs.existsSync(agentsSrc)) {
    copyRendered(agentsSrc, path.join(aiSpecs, "agents"), vars, report, opts);
  }
}

/** Register the spec workflow MCP tools. */
export function registerSpec(server: McpServer, opts: RegisterOpts = {}): void {
  const minimal = Boolean(opts.minimal);
  const add = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: Shape,
    handler: ToolSpec<Shape>["handler"],
    alwaysLoad = false,
  ) => {
    if (!shouldExpose(name, minimal)) return;
    defineTool(server, { name, description, inputSchema, handler, alwaysLoad });
  };

  add(
    "lawbook_change",
    "Specs: draft before multi-module or public-API work, validate specs you write; level, sync, archive, list, coverage, drift.",
    lawbookChangeSchema,
    async (args) => text(handleLawbookChange(args)),
  );

  add(
    "lawbook_investigate",
    "Use first on a bug, failing test, or stack trace: ranks likely origins from the graph.",
    {
      projectPath: z.string(),
      stackTrace: z.string().optional(),
      symptom: z.string().optional(),
      hintPaths: z.array(z.string()).optional(),
      maxSuspects: z.number().int().min(1).max(25).optional(),
    },
    async (args) => text(formatInvestigateResult(await investigate(args))),
    // Bugs are the commonest task; deferred, agents read files to triage.
    true,
  );
}
