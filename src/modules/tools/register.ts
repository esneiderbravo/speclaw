import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { emptyReport } from "../../shared/install.js";
import { refreshAgents } from "../../shared/agents.js";
import { loadPacks, installPack } from "./packs.js";

export { loadPacks, installPack };

/** Register the tools-module MCP tools (list_packs, add_pack). */
export function registerTools(server: McpServer, opts: RegisterOpts = {}): void {
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

  add("list_packs", "List available speclaw skill packs and what each contains.", {}, async () =>
    text(loadPacks()),
  );

  add(
    "add_pack",
    "Install one pack into an initialized project and refresh IDE symlinks.",
    {
      projectPath: z.string(),
      pack: z.string(),
      vars: z.record(z.string()).optional(),
    },
    async ({ projectPath, pack, vars }) => {
      const report = emptyReport();
      installPack(projectPath, pack, vars ?? {}, report);
      refreshAgents(projectPath, report);
      return text(report);
    },
  );
}
