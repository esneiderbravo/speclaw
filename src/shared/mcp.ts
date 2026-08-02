import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Wrap a value as an MCP text tool-result.
 *
 * @param value - Payload to return; strings are emitted verbatim, other values are pretty-printed as JSON.
 * @returns An MCP result object with a single text content block.
 */
export function text(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

/** A module contributes its MCP tools by exposing a register function. */
export type RegisterModule = (server: McpServer) => void;
