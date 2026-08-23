import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, defineAliasTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { aliasesEnabled } from "../../shared/tool-catalog.js";
import { logDeprecatedCall, prefixDeprecated } from "../../shared/deprecation.js";
import { checkAction, CheckEvent } from "./check.js";
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
    "Project setup: init questionnaire, configure agent, list or add packs.",
    speclawSetupSchema,
    async (args) => text(handleSpeclawSetup(args)),
  );

  add(
    "speclaw_check",
    "Invoked by speclaw's hooks to enforce laws — do not call directly.",
    {
      projectPath: z.string(),
      event: z.enum(["PreToolUse", "PostToolUse", "Stop", "InstructionsLoaded"]),
      toolName: z.string().optional(),
      payload: z.record(z.unknown()),
    },
    async ({ projectPath, event, toolName, payload }) =>
      text(checkAction({ projectPath, event: event as CheckEvent, toolName, payload })),
  );

  if (minimal || !aliasesEnabled()) return;

  defineAliasTool(server, {
    name: "init_project",
    description: "Deprecated alias for speclaw_setup action init.",
    inputSchema: { projectPath: z.string() },
    handler: async ({ projectPath }) => {
      logDeprecatedCall(projectPath, "init_project");
      const body = JSON.stringify(handleSpeclawSetup({ projectPath, action: "init" }), null, 2);
      return text(prefixDeprecated("init_project", body));
    },
  });

  defineAliasTool(server, {
    name: "configure_agent",
    description: "Deprecated alias for speclaw_setup configure-agent.",
    inputSchema: {
      projectPath: z.string(),
      agent: z.string(),
    },
    handler: async ({ projectPath, agent }) => {
      logDeprecatedCall(projectPath, "configure_agent");
      const body = JSON.stringify(
        handleSpeclawSetup({ projectPath, action: "configure-agent", agent }),
        null,
        2,
      );
      return text(prefixDeprecated("configure_agent", body));
    },
  });

  defineAliasTool(server, {
    name: "list_packs",
    description: "Deprecated alias for speclaw_setup list-packs.",
    inputSchema: {},
    handler: async () => {
      const body = JSON.stringify(
        handleSpeclawSetup({ projectPath: ".", action: "list-packs" }),
        null,
        2,
      );
      return text(prefixDeprecated("list_packs", body));
    },
  });

  defineAliasTool(server, {
    name: "add_pack",
    description: "Deprecated alias for speclaw_setup add-pack.",
    inputSchema: {
      projectPath: z.string(),
      pack: z.string(),
      vars: z.record(z.string()).optional(),
    },
    handler: async ({ projectPath, pack, vars }) => {
      logDeprecatedCall(projectPath, "add_pack");
      const body = JSON.stringify(
        handleSpeclawSetup({ projectPath, action: "add-pack", pack, vars }),
        null,
        2,
      );
      return text(prefixDeprecated("add_pack", body));
    },
  });
}
