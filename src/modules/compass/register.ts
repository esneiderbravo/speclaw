import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, defineAliasTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { aliasesEnabled } from "../../shared/tool-catalog.js";
import { logDeprecatedCall, prefixDeprecated } from "../../shared/deprecation.js";
import { buildIndex } from "./indexer.js";
import { impact } from "./query.js";
import { affectedTests } from "./affected.js";
import { hotspots, coupling } from "./hotspots.js";
import { startWatch, stopWatch, watchStatus } from "./watcher.js";
import {
  exploreRich,
  findSymbols,
  formatExploreRich,
  type ExploreInclude,
} from "./explore-rich.js";
import { diffContext, formatDiffContext } from "./diff-context.js";
import type { OutputMode } from "../../shared/output-budget.js";

const includeEnum = z.array(
  z.enum(["source", "callers", "callees", "blast_radius", "tests", "hotspot"]),
);

/** Register Compass MCP tools on the given server. */
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
    "compass_explore",
    "Symbol context in one call: source, callers, callees, blast radius, tests, hotspot. Prefer before grep.",
    {
      projectPath: z.string(),
      node: z.string(),
      to: z.string().optional(),
      include: includeEnum.optional(),
      mode: z.enum(["brief", "full"]).optional(),
      maxDepth: z.number().int().min(1).max(8).optional(),
    },
    async ({ projectPath, node, to, include, mode, maxDepth }) => {
      const result = await exploreRich({
        projectPath,
        node,
        to,
        include: include as ExploreInclude[] | undefined,
        mode: (mode ?? "brief") as OutputMode,
        maxDepth,
      });
      return text(formatExploreRich(result, (mode ?? "brief") as OutputMode));
    },
  );

  add(
    "compass_find",
    "Find symbols by exact name or by concept. Use exact for identifiers, concept for meaning.",
    {
      projectPath: z.string(),
      query: z.string(),
      mode: z.enum(["exact", "concept"]),
      limit: z.number().optional(),
    },
    async ({ projectPath, query, mode, limit }) =>
      text(await findSymbols(projectPath, query, mode, limit)),
  );

  add(
    "compass_diff_context",
    "Graph context of changes in one call: symbols, blast radius, tests, hotspots. Default: working tree.",
    {
      projectPath: z.string(),
      rev: z.string().optional(),
      paths: z.array(z.string()).optional(),
      mode: z.enum(["brief", "full"]).optional(),
      maxDepth: z.number().int().min(1).max(8).optional(),
    },
    async ({ projectPath, rev, paths, mode, maxDepth }) => {
      const result = diffContext({
        projectPath,
        rev,
        paths,
        mode: (mode ?? "brief") as OutputMode,
        maxDepth,
      });
      return text(formatDiffContext(result, (mode ?? "brief") as OutputMode));
    },
  );

  add(
    "compass_index",
    "Build or refresh the code graph index; optional watch action for live re-index.",
    {
      projectPath: z.string(),
      action: z.enum(["index", "start", "stop", "status"]).optional(),
      force: z.boolean().optional(),
      prune: z.boolean().optional(),
    },
    async ({ projectPath, action, force, prune }) => {
      const act = action ?? "index";
      if (act === "index") return text(await buildIndex(projectPath, { force, prune }));
      const result =
        act === "start"
          ? startWatch(projectPath)
          : act === "stop"
            ? stopWatch(projectPath)
            : watchStatus(projectPath);
      return text(result);
    },
  );

  if (minimal || !aliasesEnabled()) return;

  defineAliasTool(server, {
    name: "compass_search",
    description: "Deprecated alias for compass_find mode exact.",
    inputSchema: { projectPath: z.string(), query: z.string(), limit: z.number().optional() },
    handler: async ({ projectPath, query, limit }) => {
      logDeprecatedCall(projectPath, "compass_search");
      const body = JSON.stringify(await findSymbols(projectPath, query, "exact", limit), null, 2);
      return text(prefixDeprecated("compass_search", body));
    },
  });

  defineAliasTool(server, {
    name: "compass_recall",
    description: "Deprecated alias for compass_find mode concept.",
    inputSchema: { projectPath: z.string(), query: z.string(), limit: z.number().optional() },
    handler: async ({ projectPath, query, limit }) => {
      logDeprecatedCall(projectPath, "compass_recall");
      const body = JSON.stringify(await findSymbols(projectPath, query, "concept", limit), null, 2);
      return text(prefixDeprecated("compass_recall", body));
    },
  });

  defineAliasTool(server, {
    name: "compass_impact",
    description: "Deprecated alias for compass_explore blast_radius include.",
    inputSchema: {
      projectPath: z.string(),
      node: z.string().optional(),
      symbol: z.string().optional(),
      files: z.array(z.string()).optional(),
      maxDepth: z.number().optional(),
    },
    handler: async (args) => {
      logDeprecatedCall(args.projectPath, "compass_impact");
      const sym = args.symbol ?? args.node;
      const body = sym
        ? JSON.stringify(
            await exploreRich({
              projectPath: args.projectPath,
              node: sym,
              include: ["blast_radius"],
            }),
            null,
            2,
          )
        : JSON.stringify(
            impact(args.projectPath, { files: args.files, maxDepth: args.maxDepth ?? 4 }),
            null,
            2,
          );
      return text(prefixDeprecated("compass_impact", body));
    },
  });

  defineAliasTool(server, {
    name: "compass_trace",
    description: "Deprecated alias for compass_explore with to parameter.",
    inputSchema: {
      projectPath: z.string(),
      from: z.string(),
      to: z.string(),
      maxDepth: z.number().optional(),
    },
    handler: async ({ projectPath, from, to, maxDepth }) => {
      logDeprecatedCall(projectPath, "compass_trace");
      const body = JSON.stringify(
        await exploreRich({ projectPath, node: from, to, maxDepth }),
        null,
        2,
      );
      return text(prefixDeprecated("compass_trace", body));
    },
  });

  defineAliasTool(server, {
    name: "compass_affected_tests",
    description: "Deprecated alias — use compass_diff_context or explore.",
    inputSchema: {
      projectPath: z.string(),
      files: z.array(z.string()).optional(),
      symbols: z.array(z.string()).optional(),
      fromDiff: z.string().optional(),
    },
    handler: async (args) => {
      logDeprecatedCall(args.projectPath, "compass_affected_tests");
      const body = JSON.stringify(affectedTests(args.projectPath, args), null, 2);
      return text(prefixDeprecated("compass_affected_tests", body));
    },
  });

  defineAliasTool(server, {
    name: "compass_hotspots",
    description: "Deprecated alias — use compass_explore hotspot include.",
    inputSchema: { projectPath: z.string(), limit: z.number().optional() },
    handler: async ({ projectPath, limit }) => {
      logDeprecatedCall(projectPath, "compass_hotspots");
      const body = JSON.stringify(hotspots(projectPath, { limit }), null, 2);
      return text(prefixDeprecated("compass_hotspots", body));
    },
  });

  defineAliasTool(server, {
    name: "compass_coupling",
    description: "Deprecated alias — use compass_diff_context.",
    inputSchema: { projectPath: z.string(), file: z.string() },
    handler: async ({ projectPath, file }) => {
      logDeprecatedCall(projectPath, "compass_coupling");
      const body = JSON.stringify(coupling(projectPath, file, {}), null, 2);
      return text(prefixDeprecated("compass_coupling", body));
    },
  });

  defineAliasTool(server, {
    name: "compass_watch",
    description: "Deprecated alias for compass_index watch actions.",
    inputSchema: {
      projectPath: z.string(),
      action: z.enum(["start", "stop", "status"]),
    },
    handler: async ({ projectPath, action }) => {
      logDeprecatedCall(projectPath, "compass_watch");
      const result =
        action === "start"
          ? startWatch(projectPath)
          : action === "stop"
            ? stopWatch(projectPath)
            : watchStatus(projectPath);
      return text(prefixDeprecated("compass_watch", JSON.stringify(result, null, 2)));
    },
  });
}
