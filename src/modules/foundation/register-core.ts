import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { checkAction, CheckEvent, wantsDocHint, withHint } from "./check.js";
import { handleSpeclawSetup, speclawSetupSchema } from "./setup-tool.js";

type AddFn = <Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: Shape,
  handler: ToolSpec<Shape>["handler"],
) => void;

function makeAdd(server: McpServer, minimal: boolean): AddFn {
  return (name, description, inputSchema, handler) => {
    if (!shouldExpose(name, minimal)) return;
    defineTool(server, { name, description, inputSchema, handler });
  };
}

/**
 * Foundation MCP tools (setup + hook check). `doctor` and `law_verify` are CLI-only.
 * `scaffold` is CLI-only after tool-surface consolidation.
 */
export function registerFoundationCore(server: McpServer, opts: RegisterOpts = {}): void {
  const minimal = Boolean(opts.minimal);
  const add = makeAdd(server, minimal);

  add(
    "speclaw_setup",
    "Use to install or reconfigure speclaw: init questionnaire, configure an agent, list or add packs.",
    speclawSetupSchema,
    async (args) => text(handleSpeclawSetup(args)),
  );

  add(
    "speclaw_check",
    "Invoked by speclaw's hooks to enforce laws — do not call directly.",
    {
      projectPath: z.string(),
      event: z.enum([
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "Stop",
        "InstructionsLoaded",
      ]),
      toolName: z.string().optional(),
      payload: z.record(z.unknown()),
    },
    async ({ projectPath, event, toolName, payload }) => {
      const args = { projectPath, event: event as CheckEvent, toolName, payload };
      const result = checkAction(args);
      if (!wantsDocHint(args)) return text(result);
      // Loaded here, not in checkAction: the hint measures the diff with the index.
      const { docHint } = await import("../lawbook/ship.js");
      const hint = docHint(projectPath);
      return text(hint ? withHint(result, hint) : result);
    },
  );
}
