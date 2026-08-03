import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { text } from "../../shared/mcp.js";
import { emptyReport } from "../../shared/install.js";
import { refreshAgents } from "../../shared/agents.js";
import { loadPacks, installPack } from "./packs.js";

export { loadPacks, installPack };

// ─── The tools module: opt-in packs of skills, agents, and commands ───

/** Register the tools-module MCP tools (list_packs, add_pack). */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "list_packs",
    {
      description: "List the available speclaw skill packs and what each contains.",
      inputSchema: {},
    },
    async () => text(loadPacks())
  );

  server.registerTool(
    "add_pack",
    {
      description:
        "Add a single pack to an already-initialized project, then refresh IDE symlinks. Pass template vars (organization, ...) if the pack needs them.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        pack: z.string().describe("Pack name (see list_packs)"),
        vars: z.record(z.string()).optional().describe("Template variables for rendering"),
      },
    },
    async ({ projectPath, pack, vars }) => {
      const report = emptyReport();
      installPack(projectPath, pack, vars ?? {}, report);
      refreshAgents(projectPath, report); // link the new content into already-configured agents
      return text(report);
    }
  );
}
