import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool, text, type ToolSpec } from "../../shared/mcp.js";
import { shouldExpose, type RegisterOpts } from "../../shared/exposure.js";
import { recordCompassCall } from "../../shared/compass-calls.js";
import { buildIndex } from "./indexer.js";
import { startWatch, stopWatch, watchStatus } from "./watcher.js";
import {
  exploreRich,
  findSymbols,
  formatExploreRich,
  type ExploreInclude,
} from "./explore-rich.js";
import { diffContext, formatDiffContext } from "./diff-context.js";
import { formatFindResponse } from "./find-output.js";
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
    alwaysLoad = false,
  ) => {
    if (!shouldExpose(name, minimal)) return;
    // Every canonical call lands in the call log the Cortex gate and the
    // Compass-first nudge read; the write is best-effort and never throws.
    const call = handler as (args: { projectPath: string }, extra: unknown) => unknown;
    const logged = ((args: { projectPath: string }, extra: unknown) => {
      recordCompassCall(args.projectPath, name);
      return call(args, extra);
    }) as typeof handler;
    defineTool(server, { name, description, inputSchema, handler: logged, alwaysLoad });
  };

  add(
    "compass_explore",
    "Symbol context in one call: source, callers, callees, blast radius, tests. maxDepth>1 returns the whole callee chain with source.",
    {
      projectPath: z.string(),
      node: z.string().optional(),
      query: z.string().optional(),
      to: z.string().optional(),
      include: includeEnum.optional(),
      mode: z.enum(["brief", "full"]).optional(),
      maxDepth: z.number().int().min(1).max(8).optional(),
    },
    async ({ projectPath, node, query, to, include, mode, maxDepth }) => {
      if (!node) {
        // Agents send a search phrase here; answer it as a find instead of a
        // validation error that costs a second call.
        if (!query) throw new Error("compass_explore requires 'node' (a symbol name)");
        const found = await findSymbols(projectPath, query, "concept");
        return text(formatFindResponse(found), { maxTokens: found.cap });
      }
      const result = await exploreRich({
        projectPath,
        node,
        to,
        include: include as ExploreInclude[] | undefined,
        mode: (mode ?? "brief") as OutputMode,
        maxDepth,
      });
      return text(formatExploreRich(result, (mode ?? "brief") as OutputMode), mode ?? "brief");
    },
    // The two code-reading tools load up front: deferred, agents `cat` instead.
    true,
  );

  add(
    "compass_find",
    "Hybrid search over the index: BM25, vectors, and name match. mode sets weights; pass focus for edited files.",
    {
      projectPath: z.string(),
      query: z.string(),
      mode: z.enum(["exact", "concept"]),
      limit: z.number().optional(),
      focus: z.array(z.string()).optional(),
      maxTokens: z.number().int().min(256).max(32_000).optional(),
    },
    async ({ projectPath, query, mode, limit, focus, maxTokens }) => {
      const found = await findSymbols(projectPath, query, mode, limit, { focus, maxTokens });
      return text(formatFindResponse(found), { maxTokens: found.cap });
    },
    true,
  );

  add(
    "compass_diff_context",
    "Use before testing or finishing: what the diff touches — symbols, blast radius, covering tests.",
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
      return text(formatDiffContext(result, (mode ?? "brief") as OutputMode), mode ?? "brief");
    },
    true,
  );

  add(
    "compass_index",
    "Use when the index is missing or stale: build or refresh the code graph; watch re-indexes live.",
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
}
