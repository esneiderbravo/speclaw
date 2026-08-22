import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { buildIndex } from "./indexer.js";
import { explore, search, recall, impact, trace } from "./query.js";
import { startWatch, stopWatch, watchStatus } from "./watcher.js";
import { visualize } from "./visualize.js";

// ─── Compass: speclaw's own code-intelligence engine (no external deps) ───

/**
 * Register Compass MCP tools on the given server.
 *
 * @param server - The MCP server to register on.
 * @param opts - Exposure options (`minimal` omits setup/specialized tools).
 */
export function registerCompass(server: McpServer, opts: RegisterOpts = {}): void {
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
    "compass_index",
    "Build or refresh the local code graph index. Run once per project, then on demand.",
    { projectPath: z.string() },
    async ({ projectPath }) => text(await buildIndex(projectPath)),
  );

  add(
    "compass_explore",
    "Read a symbol's source plus callers and callees. Prefer this before grep or Read.",
    { projectPath: z.string(), node: z.string() },
    async ({ projectPath, node }) => text(explore(projectPath, node)),
  );

  add(
    "compass_search",
    "Find symbols by name or keyword (substring). Cheaper structural search than grep.",
    { projectPath: z.string(), query: z.string(), limit: z.number().optional() },
    async ({ projectPath, query, limit }) => text(search(projectPath, query, limit ?? 25)),
  );

  add(
    "compass_recall",
    "Find symbols by meaning via local embeddings. Use when names are unknown.",
    { projectPath: z.string(), query: z.string(), limit: z.number().optional() },
    async ({ projectPath, query, limit }) => text(await recall(projectPath, query, limit ?? 15)),
  );

  add(
    "compass_impact",
    "List transitive callers of a symbol (blast radius) before editing.",
    { projectPath: z.string(), node: z.string(), maxDepth: z.number().optional() },
    async ({ projectPath, node, maxDepth }) => text(impact(projectPath, node, maxDepth ?? 4)),
  );

  add(
    "compass_trace",
    "Find a call path between two symbols within a depth limit.",
    {
      projectPath: z.string(),
      from: z.string(),
      to: z.string(),
      maxDepth: z.number().optional(),
    },
    async ({ projectPath, from, to, maxDepth }) =>
      text(trace(projectPath, from, to, maxDepth ?? 8)),
  );

  add(
    "compass_visualize",
    "Write an offline HTML graph to .speclaw/graph.html for interactive exploration.",
    {
      projectPath: z.string(),
      node: z.string().optional(),
      depth: z.number().optional(),
      limit: z.number().optional(),
    },
    async ({ projectPath, node, depth, limit }) =>
      text(visualize(projectPath, { focus: node, depth, limit })),
  );

  add(
    "compass_watch",
    "Start, stop, or status a debounced file watcher that re-indexes on change.",
    {
      projectPath: z.string(),
      action: z.enum(["start", "stop", "status"]),
    },
    async ({ projectPath, action }) => {
      const result =
        action === "start"
          ? startWatch(projectPath)
          : action === "stop"
            ? stopWatch(projectPath)
            : watchStatus(projectPath);
      return text(result);
    },
  );
}
