/**
 * Cortex MCP registration — One brain. Many agents.
 *
 * // Covers: req~cortex-module~1
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import {
  handleHarness,
  harnessOps,
  readHarness,
  type HarnessOp,
  type HarnessVerdict,
} from "./harness.js";
import { briefForStage } from "./brief.js";
import { fitStatusResult } from "./status.js";

export const cortexActions = [...harnessOps, "brief"] as const;
export type CortexAction = (typeof cortexActions)[number];

/**
 * Register the canonical `cortex` MCP tool.
 *
 * @param server - MCP server instance.
 * @param opts - Exposure profile.
 */
export function registerCortex(server: McpServer, opts: RegisterOpts = {}): void {
  const minimal = Boolean(opts.minimal);
  const add = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: Shape,
    handler: ToolSpec<Shape>["handler"],
  ) => {
    if (!shouldExpose(name, minimal)) return;
    defineTool(server, { name, description, inputSchema, handler });
  };

  add(
    "cortex",
    "Cortex multi-agent loop: status with summary, start, advance, rework, brief for a change.",
    {
      projectPath: z.string(),
      change: z.string(),
      action: z.enum(cortexActions),
      note: z.string().optional(),
      verdict: z.enum(["PASS", "FAIL"]).optional(),
      openQuestions: z.array(z.string()).optional(),
      pauseForQuestions: z.boolean().optional(),
    },
    async ({ projectPath, change, action, note, verdict, openQuestions, pauseForQuestions }) => {
      if (action === "brief") {
        const state = readHarness(projectPath, change);
        const brief = briefForStage(state?.stage ?? null);
        return text(JSON.stringify({ state, ...brief }, null, 2));
      }
      const result = handleHarness({
        projectPath,
        change,
        harnessOp: action as HarnessOp,
        note,
        verdict: (verdict as HarnessVerdict | undefined) ?? null,
        openQuestions,
        pauseForQuestions,
      });
      // `text()` cuts from the end; fit `status` so `summary` and valid JSON survive.
      return text(action === "status" && "summary" in result ? fitStatusResult(result) : result);
    },
  );
}
