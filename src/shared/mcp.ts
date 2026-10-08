import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { loadDeclaredBudget, type RegisterOpts } from "./exposure.js";
import { toolDefinitionTokens } from "./schema-tokens.js";
import { countWords } from "./tokens.js";
import { applyTextBudget, type TextBudget } from "./output-budget.js";

export type { TextBudget } from "./output-budget.js";

/**
 * Wrap a value as an MCP text tool-result, applying an output budget.
 *
 * @param value - Payload to return; strings are emitted verbatim, other values are pretty-printed as JSON.
 * @param budget - Output mode (`brief` default, unchanged for callers that pass
 *   none) or an explicit `{ maxTokens }` cap a handler opted into.
 * @returns An MCP result object with a single text content block.
 */
// Covers: req~find-response-budget~1
export function text(value: unknown, budget: TextBudget = "brief") {
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const budgeted = applyTextBudget(raw, budget);
  return {
    content: [
      {
        type: "text" as const,
        text: budgeted.text,
      },
    ],
  };
}

/** A module contributes its MCP tools by exposing a register function. */
export type RegisterModule = (server: McpServer, opts?: RegisterOpts) => void;

/** Zod raw shape accepted by MCP `registerTool` / {@link defineTool}. */
export type ToolInputShape = z.ZodRawShape;

/**
 * Spec for {@link defineTool}. Generic over the input shape so the handler
 * receives inferred args — no `any`, no eslint suppressions.
 */
export interface ToolSpec<Shape extends ToolInputShape = ToolInputShape> {
  name: string;
  description: string;
  inputSchema?: Shape;
  handler: ToolCallback<Shape>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  /**
   * Load the definition up front instead of behind the client's tool search
   * (Claude Code: `_meta["anthropic/alwaysLoad"]`). Reserve it for the tools
   * agents need on every task: a deferred tool costs a search turn, so agents
   * fall back to shell reads instead.
   */
  alwaysLoad?: boolean;
}

/**
 * Register one MCP tool after enforcing the context-budget caps (description
 * word count and estimated definition tokens). `alwaysLoad` marks the
 * definition `_meta["anthropic/alwaysLoad"]` so Claude Code never defers it.
 *
 * @param server - MCP server to register on.
 * @param spec - Tool name, description, schema, and handler.
 * @throws If the description or definition cost exceeds the declared cap.
 */
export function defineTool<Shape extends ToolInputShape>(
  server: McpServer,
  spec: ToolSpec<Shape>,
): void {
  const budget = loadDeclaredBudget();
  const words = countWords(spec.description);
  if (words > budget.maxDescriptionWords) {
    throw new Error(
      `tool ${spec.name}: description is ${words} words (cap ${budget.maxDescriptionWords})`,
    );
  }
  const cost = toolDefinitionTokens({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
  });
  if (cost > budget.perTool) {
    throw new Error(`tool ${spec.name}: ${cost} tokens exceeds the ${budget.perTool} per-tool cap`);
  }
  const inputSchema = (spec.inputSchema ?? {}) as Shape;
  server.registerTool(
    spec.name,
    {
      description: spec.description,
      inputSchema,
      ...(spec.annotations ? { annotations: spec.annotations } : {}),
      ...(spec.alwaysLoad ? { _meta: { "anthropic/alwaysLoad": true } } : {}),
    },
    spec.handler,
  );
}

const ALIAS_MAX_WORDS = 12;
const ALIAS_MAX_TOKENS = 200;

/**
 * Register a deprecated alias with a terse description (not counted in the
 * canonical eight-tool limit).
 */
export function defineAliasTool<Shape extends ToolInputShape>(
  server: McpServer,
  spec: ToolSpec<Shape>,
): void {
  const words = countWords(spec.description);
  if (words > ALIAS_MAX_WORDS) {
    throw new Error(`alias ${spec.name}: description is ${words} words (cap ${ALIAS_MAX_WORDS})`);
  }
  const cost = toolDefinitionTokens({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
  });
  if (cost > ALIAS_MAX_TOKENS) {
    throw new Error(`alias ${spec.name}: ${cost} tokens exceeds alias cap ${ALIAS_MAX_TOKENS}`);
  }
  const inputSchema = (spec.inputSchema ?? {}) as Shape;
  server.registerTool(spec.name, { description: spec.description, inputSchema }, spec.handler);
}
