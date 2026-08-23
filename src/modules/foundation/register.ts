import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { registerFoundationCore } from "./register-core.js";

export { registerFoundationCore } from "./register-core.js";

const DOCTOR_DESCRIPTION =
  "Verify the speclaw install; returns a versioned DoctorReport (schemaVersion 1).";

/** Register foundation MCP tools (core + doctor). */
export function registerFoundation(server: McpServer, opts: RegisterOpts = {}): void {
  registerFoundationCore(server, opts);
  const minimal = Boolean(opts.minimal);
  if (!shouldExpose("doctor", minimal)) return;

  const inputSchema = { projectPath: z.string() };
  const handler: ToolSpec<typeof inputSchema>["handler"] = async ({ projectPath }) => {
    // Lazy load: register.ts must stay out of the context-budget → doctor SCC.
    const { doctor } = await import("./doctor.js");
    const report = await doctor(projectPath, { redact: true });
    return text(report);
  };
  defineTool(server, {
    name: "doctor",
    description: DOCTOR_DESCRIPTION,
    inputSchema,
    handler,
  });
}
