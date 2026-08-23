import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerCompass } from "../compass/register.js";
import { registerSpec } from "../lawbook/register.js";
import { registerTools } from "../tools/register.js";
import { registerFoundationCore } from "./register.js";
import { measureBudget, type BudgetMeasurement } from "../../shared/budget.js";
import { isMinimalMode, packageRoot, shouldExpose } from "../../shared/exposure.js";
import type { ToolDefForBudget } from "../../shared/schema-tokens.js";

/** Mirrors the `doctor` tool surface without importing `doctor.ts` (avoids a cycle). */
const DOCTOR_TOOL_FOR_BUDGET: ToolDefForBudget = {
  name: "doctor",
  description: "Verify the speclaw install; returns a versioned DoctorReport (schemaVersion 1).",
  inputSchema: { projectPath: z.string() },
};

/**
 * Collect tool definitions as the MCP server would register them for a profile.
 *
 * Uses `registerFoundationCore` plus a static `doctor` stub so budget/doctor
 * measurement never imports the live `doctor` implementation (module cycle).
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
  registerFoundationCore(stub, opts);
  if (shouldExpose("doctor", minimal)) {
    tools.push(DOCTOR_TOOL_FOR_BUDGET);
  }
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
