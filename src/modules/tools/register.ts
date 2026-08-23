import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegisterOpts } from "../../shared/exposure.js";

export { loadPacks, installPack } from "./packs.js";

/** Packs are registered via `speclaw_setup` — no standalone MCP tools. */
export function registerTools(_server: McpServer, _opts: RegisterOpts = {}): void {
  /* consolidated into speclaw_setup */
}
