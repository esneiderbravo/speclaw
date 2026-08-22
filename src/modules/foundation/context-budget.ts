import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { registerCompass } from "../compass/register.js";
import { registerSpec } from "../lawbook/register.js";
import { registerTools } from "../tools/register.js";
import { registerFoundation } from "./register.js";
import { measureBudget, type BudgetMeasurement } from "../../shared/budget.js";
import { isMinimalMode, packageRoot } from "../../shared/exposure.js";
import type { ToolDefForBudget } from "../../shared/schema-tokens.js";

/**
 * Collect tool definitions as the MCP server would register them for a profile.
 *
 * @param minimal - Exposure profile.
 */
export function collectRegisteredTools(minimal: boolean): ToolDefForBudget[] {
  const tools: ToolDefForBudget[] = [];
  const server = {
    registerTool(
      name: string,
      config: { description?: string; inputSchema?: Record<string, z.ZodTypeAny> },
    ) {
      tools.push({
        name,
        description: config.description ?? "",
        inputSchema: config.inputSchema,
      });
    },
  };
  const opts = { minimal };
  const stub = server as unknown as McpServer;
  registerFoundation(stub, opts);
  registerSpec(stub, opts);
  registerCompass(stub, opts);
  registerTools(stub, opts);
  return tools;
}

/**
 * Measure context budget for an install (registered tools + project files).
 *
 * @param projectPath - Project root.
 * @param minimal - Optional forced profile.
 */
export function measureInstallBudget(projectPath: string, minimal?: boolean): BudgetMeasurement {
  const profile = minimal ?? isMinimalMode(projectPath);
  return measureBudget({
    projectPath,
    packagePath: packageRoot(),
    tools: collectRegisteredTools(profile),
    minimal: profile,
  });
}
