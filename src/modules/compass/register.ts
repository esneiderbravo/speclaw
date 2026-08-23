import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { buildIndex } from "./indexer.js";
import { explore, search, recall, impact, trace } from "./query.js";
import { affectedTests } from "./affected.js";
import { hotspots, coupling } from "./hotspots.js";
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
    "Blast radius for a symbol or files, grouped by module (not a flat dump).",
    {
      projectPath: z.string(),
      /** @deprecated Prefer `symbol`. Kept for existing callers. */
      node: z.string().optional(),
      symbol: z.string().optional(),
      files: z.array(z.string()).optional(),
      nodeId: z.number().int().optional(),
      maxDepth: z.number().int().min(1).max(12).optional(),
      edgeKinds: z.array(z.enum(["call", "import"])).optional(),
      target: z.enum(["build", "test", "lint", "any"]).optional(),
      format: z.enum(["grouped", "flat"]).optional(),
      topModules: z.number().int().min(1).max(50).optional(),
      topPerModule: z.number().int().min(1).max(50).optional(),
    },
    async (args) =>
      text(
        impact(args.projectPath, {
          symbol: args.symbol ?? args.node,
          files: args.files,
          nodeId: args.nodeId,
          maxDepth: args.maxDepth ?? 4,
          edgeKinds: args.edgeKinds,
          target: args.target,
          format: args.format ?? "grouped",
          topModules: args.topModules,
          topPerModule: args.topPerModule,
        }),
      ),
  );

  add(
    "compass_affected_tests",
    "Select test files affected by a change; returns a ready-to-run command.",
    {
      projectPath: z.string(),
      files: z.array(z.string()).optional(),
      symbols: z.array(z.string()).optional(),
      fromDiff: z.string().optional(),
      maxDepth: z.number().int().min(1).max(12).optional(),
    },
    async ({ projectPath, files, symbols, fromDiff, maxDepth }) =>
      text(affectedTests(projectPath, { files, symbols, fromDiff, maxDepth })),
  );

  add(
    "compass_hotspots",
    "Rank files by recent churn and AST complexity; two axes, no magic score.",
    {
      projectPath: z.string(),
      days: z.number().int().min(1).max(3650).optional(),
      since: z.string().optional(),
      sortBy: z.enum(["churn", "complexity", "combined"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ projectPath, days, since, sortBy, limit }) =>
      text(hotspots(projectPath, { days, since, sortBy, limit })),
  );

  add(
    "compass_coupling",
    "Files that co-change with a target; strength, graph edge, and test-pair facts.",
    {
      projectPath: z.string(),
      file: z.string(),
      days: z.number().int().min(1).max(3650).optional(),
      since: z.string().optional(),
      minShared: z.number().int().min(1).optional(),
      maxFilesPerCommit: z.number().int().min(2).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ projectPath, file, days, since, minShared, maxFilesPerCommit, limit }) =>
      text(coupling(projectPath, file, { days, since, minShared, maxFilesPerCommit, limit })),
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
