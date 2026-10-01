import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCompass } from "./modules/compass/register.js";
import { registerCortex } from "./modules/cortex/register.js";
import { registerSpec } from "./modules/lawbook/register.js";
import { registerFoundation } from "./modules/foundation/register.js";
import { registerTools } from "./modules/tools/register.js";
import { isMinimalMode, type RegisterOpts } from "./shared/exposure.js";
import { pkgVersion } from "./shared/version.js";

/**
 * Build the speclaw MCP server with every module's tools registered.
 *
 * @param opts - Optional exposure overrides; defaults to {@link isMinimalMode}.
 */
export function buildServer(opts: RegisterOpts = {}): McpServer {
  const minimal = opts.minimal ?? isMinimalMode();
  const server = new McpServer({ name: "speclaw", version: pkgVersion() });
  const reg = { minimal };
  registerFoundation(server, reg);
  registerSpec(server, reg);
  registerCompass(server, reg);
  registerCortex(server, reg);
  registerTools(server, reg);
  return server;
}

/** Start the MCP server over stdio (used by `speclaw mcp`). */
export async function startMcpServer(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
