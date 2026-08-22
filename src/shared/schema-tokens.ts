import type { z } from "zod";
import { estimateTokens } from "./tokens.js";

/**
 * Best-effort JSON Schema for the Zod shapes speclaw registers as MCP
 * `inputSchema` records. Stable and offline — used only for token budgeting,
 * not for validation. Prefer structural fidelity over full Zod coverage.
 *
 * @param shape - Record of Zod fields as passed to `registerTool`.
 * @returns A JSON-Schema-like plain object suitable for `JSON.stringify`.
 */
export function zodShapeToJsonSchema(
  shape: Record<string, z.ZodTypeAny> | undefined,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, schema] of Object.entries(shape ?? {})) {
    const { json, optional } = zodTypeToJson(schema);
    properties[key] = json;
    if (!optional) required.push(key);
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
  };
}

function zodTypeToJson(schema: z.ZodTypeAny): { json: Record<string, unknown>; optional: boolean } {
  const def = schema._def as {
    typeName?: string;
    description?: string;
    values?: string[];
    innerType?: z.ZodTypeAny;
    type?: z.ZodTypeAny;
    shape?: () => Record<string, z.ZodTypeAny>;
    keyType?: z.ZodTypeAny;
    valueType?: z.ZodTypeAny;
  };
  const typeName = def.typeName ?? "";
  const description = def.description;

  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    const inner = zodTypeToJson(def.innerType!);
    return { json: withDesc(inner.json, description), optional: true };
  }
  if (typeName === "ZodString") {
    return { json: withDesc({ type: "string" }, description), optional: false };
  }
  if (typeName === "ZodNumber") {
    return { json: withDesc({ type: "number" }, description), optional: false };
  }
  if (typeName === "ZodBoolean") {
    return { json: withDesc({ type: "boolean" }, description), optional: false };
  }
  if (typeName === "ZodEnum") {
    return {
      json: withDesc({ type: "string", enum: def.values ?? [] }, description),
      optional: false,
    };
  }
  if (typeName === "ZodArray") {
    const item = zodTypeToJson(def.type!);
    return {
      json: withDesc({ type: "array", items: item.json }, description),
      optional: false,
    };
  }
  if (typeName === "ZodObject") {
    return {
      json: withDesc(zodShapeToJsonSchema(def.shape?.() ?? {}), description),
      optional: false,
    };
  }
  if (typeName === "ZodRecord") {
    const value = def.valueType ? zodTypeToJson(def.valueType).json : {};
    return {
      json: withDesc({ type: "object", additionalProperties: value }, description),
      optional: false,
    };
  }
  if (typeName === "ZodUnknown" || typeName === "ZodAny") {
    return { json: withDesc({}, description), optional: false };
  }
  // Fallback: type name only — still deterministic for budgeting.
  return { json: withDesc({ type: typeName || "unknown" }, description), optional: false };
}

function withDesc(
  json: Record<string, unknown>,
  description: string | undefined,
): Record<string, unknown> {
  return description ? { ...json, description } : json;
}

/** One registered tool's definition fields used for budgeting. */
export interface ToolDefForBudget {
  name: string;
  description: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
}

/**
 * Estimate tokens for one tool definition (name + description + JSON Schema).
 *
 * @param tool - Registered tool fields.
 * @returns Estimated definition cost.
 */
export function toolDefinitionTokens(tool: ToolDefForBudget): number {
  const schemaJson = JSON.stringify(zodShapeToJsonSchema(tool.inputSchema));
  return estimateTokens(tool.name) + estimateTokens(tool.description) + estimateTokens(schemaJson);
}
