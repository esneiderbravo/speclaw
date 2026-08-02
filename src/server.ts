import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCompass } from "./modules/compass/register.js";
import { registerSpec } from "./modules/spec/register.js";
import { registerFoundation } from "./modules/foundation/register.js";
import { registerTools } from "./modules/tools/register.js";

/** Build the speclaw MCP server with every module's tools registered. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "speclaw", version: "0.1.0" });
  // Each module contributes its own MCP tools. Adding a module = one line here.
  registerFoundation(server); // init_project, scaffold, configure_agent, doctor
  registerSpec(server); // spec_init, spec_validate, spec_sync, spec_archive, spec_list
  registerCompass(server); // compass_index, explore, search, recall, impact, trace, watch
  registerTools(server); // list_packs, add_pack
  return server;
}

/** Start the MCP server over stdio (used by `speclaw mcp`). */
export async function startMcpServer(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
