import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, defineAliasTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { aliasesEnabled } from "../../shared/tool-catalog.js";
import { logDeprecatedCall, prefixDeprecated } from "../../shared/deprecation.js";
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
}

/** Register the spec workflow MCP tools. */
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
    "lawbook_change",
    "Lawbook lifecycle: init, list, validate, sync, archive, level, coverage, drift.",
    lawbookChangeSchema,
    async (args) => text(handleLawbookChange(args)),
  );

  add(
    "lawbook_investigate",
    "Rank bug origins from the graph. Pass stackTrace or symptom — evidence, not verdict.",
    {
      projectPath: z.string(),
      stackTrace: z.string().optional(),
      symptom: z.string().optional(),
      hintPaths: z.array(z.string()).optional(),
      maxSuspects: z.number().int().min(1).max(25).optional(),
    },
    async (args) => text(formatInvestigateResult(await investigate(args))),
  );

  if (minimal || !aliasesEnabled()) return;

  const aliasHandler =
    (alias: string, action: Parameters<typeof handleLawbookChange>[0]["action"]) =>
    async (args: { projectPath: string; change?: string; date?: string; [k: string]: unknown }) => {
      logDeprecatedCall(args.projectPath, alias);
      const merged = { ...args, action } as Parameters<typeof handleLawbookChange>[0];
      const result = handleLawbookChange(merged);
      const body = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return text(prefixDeprecated(alias, body));
    };

  defineAliasTool(server, {
    name: "lawbook_init",
    description: "Deprecated alias for lawbook_change action init.",
    inputSchema: { projectPath: z.string() },
    handler: aliasHandler("lawbook_init", "init"),
  });

  defineAliasTool(server, {
    name: "lawbook_list",
    description: "Deprecated alias for lawbook_change action list.",
    inputSchema: { projectPath: z.string() },
    handler: aliasHandler("lawbook_list", "list"),
  });

  defineAliasTool(server, {
    name: "lawbook_validate",
    description: "Deprecated alias for lawbook_change action validate.",
    inputSchema: { projectPath: z.string(), change: z.string() },
    handler: aliasHandler("lawbook_validate", "validate"),
  });

  defineAliasTool(server, {
    name: "lawbook_sync",
    description: "Deprecated alias for lawbook_change action sync.",
    inputSchema: { projectPath: z.string(), change: z.string() },
    handler: aliasHandler("lawbook_sync", "sync"),
  });

  defineAliasTool(server, {
    name: "lawbook_archive",
    description: "Deprecated alias for lawbook_change action archive.",
    inputSchema: {
      projectPath: z.string(),
      change: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    handler: aliasHandler("lawbook_archive", "archive"),
  });

  defineAliasTool(server, {
    name: "lawbook_level",
    description: "Deprecated alias for lawbook_change action level.",
    inputSchema: {
      projectPath: z.string(),
      mode: z.string().optional(),
      change: z.string().optional(),
      level: z.number().optional(),
      reason: z.string().optional(),
    },
    handler: async (args) => {
      logDeprecatedCall(args.projectPath, "lawbook_level");
      const body = JSON.stringify(
        handleLawbookChange({ ...args, action: "level" } as Parameters<
          typeof handleLawbookChange
        >[0]),
        null,
        2,
      );
      return text(prefixDeprecated("lawbook_level", body));
    },
  });

  defineAliasTool(server, {
    name: "lawbook_coverage",
    description: "Deprecated alias for lawbook_change action coverage.",
    inputSchema: {
      projectPath: z.string(),
      change: z.string().optional(),
      onlyDefects: z.boolean().optional(),
      json: z.boolean().optional(),
    },
    handler: async (args) => {
      logDeprecatedCall(args.projectPath, "lawbook_coverage");
      const body = JSON.stringify(handleLawbookChange({ ...args, action: "coverage" }), null, 2);
      return text(prefixDeprecated("lawbook_coverage", body));
    },
  });

  defineAliasTool(server, {
    name: "lawbook_drift",
    description: "Deprecated alias for lawbook_change action drift.",
    inputSchema: {
      projectPath: z.string(),
      capability: z.string().optional(),
      includeReverse: z.boolean().optional(),
      maxItems: z.number().int().optional(),
      json: z.boolean().optional(),
    },
    handler: async (args) => {
      logDeprecatedCall(args.projectPath, "lawbook_drift");
      const body = JSON.stringify(handleLawbookChange({ ...args, action: "drift" }), null, 2);
      return text(prefixDeprecated("lawbook_drift", body));
    },
  });
}
