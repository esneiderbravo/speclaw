import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type RegisterOpts } from "../../shared/exposure.js";
import { registerFoundationCore } from "./register-core.js";

export { registerFoundationCore } from "./register-core.js";

/** Register foundation MCP tools. Doctor is CLI-only (`speclaw doctor`). */
export function registerFoundation(server: McpServer, opts: RegisterOpts = {}): void {
  registerFoundationCore(server, opts);
}
