import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** One tool captured from a module's register function: its name, config, and handler. */
export interface CapturedTool {
  name: string;
  config: { description?: string; inputSchema?: Record<string, z.ZodTypeAny> };
  handler: (args: unknown) => unknown;
}

/**
 * Drive a module's `registerX(server)` function against a stub MCP server that
 * records every `registerTool` call, so a contract test can inspect the declared
 * input schemas and invoke the handlers without a real MCP transport.
 *
 * @param register - A module's register function (e.g. `registerSpec`).
 * @returns The captured tools keyed by tool name.
 */
export function captureTools(register: (server: McpServer) => void): Map<string, CapturedTool> {
  const tools = new Map<string, CapturedTool>();
  const server = {
    registerTool(name: string, config: CapturedTool["config"], handler: CapturedTool["handler"]) {
      tools.set(name, { name, config, handler });
    },
  };
  // The stub implements only the registerTool surface these tests exercise.
  register(server as unknown as McpServer);
  return tools;
}

/** Compile a captured tool's raw input shape into a Zod object for validation checks. */
export function schemaOf(tool: CapturedTool): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(tool.config.inputSchema ?? {});
}

/** An MCP text result: a single text content block. */
export interface McpTextResult {
  content: Array<{ type: "text"; text: string }>;
}

/** Assert (structurally) that a handler return value is a well-formed MCP text result. */
export function isTextResult(value: unknown): value is McpTextResult {
  const v = value as McpTextResult;
  return (
    !!v &&
    Array.isArray(v.content) &&
    v.content.length === 1 &&
    v.content[0]?.type === "text" &&
    typeof v.content[0]?.text === "string"
  );
}
