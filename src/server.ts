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
 * Sent in the MCP `initialize` response; Claude Code keeps it in the agent's
 * context even while tool definitions are deferred, so it names the one tool
 * per job that replaces a shell read. Kept short: it is paid on every session.
 */
export const SERVER_INSTRUCTIONS = [
  "speclaw has a tool for each of these jobs; use it instead of shell reads:",
  '- Locate code: compass_find. Read it: compass_explore (include ["source"]; maxDepth 4 reads a whole call chain; blast_radius before changing a symbol). Not cat/sed/grep/rg.',
  "- Failing test, bug, or stack trace: lawbook_investigate first, with the test output as stackTrace — it ranks the code that test reaches.",
  "- Before running tests or finishing: compass_diff_context (what the diff touches, which tests cover it).",
  "- Multi-module or public-API work: lawbook_change draft before coding; validate any spec you write.",
  "- No or stale index: compass_index. 3+ large independent parts: cortex. Setup: speclaw_setup.",
  "Markdown, JSON, and config files are fine to read directly.",
].join("\n");

/**
 * Build the speclaw MCP server with every module's tools registered.
 *
 * @param opts - Optional exposure overrides; defaults to {@link isMinimalMode}.
 */
export function buildServer(opts: RegisterOpts = {}): McpServer {
  const minimal = opts.minimal ?? isMinimalMode();
  const server = new McpServer(
    { name: "speclaw", version: pkgVersion() },
    { instructions: SERVER_INSTRUCTIONS },
  );
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
