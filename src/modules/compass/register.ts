import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { text } from "../../shared/mcp.js";
import { buildIndex } from "./indexer.js";
import { explore, search, recall, impact, trace } from "./query.js";
import { startWatch, stopWatch, watchStatus } from "./watcher.js";

// ─── Compass: speclaw's own code-intelligence engine (no external deps) ───
// A local graph of the codebase (nodes = definitions, edges = calls/imports)
// plus a local vector store for semantic recall. Lives in .speclaw/ (gitignored).

/**
 * Register all Compass MCP tools (index, explore, search, recall, impact,
 * trace, watch) on the given server.
 *
 * @param server - The MCP server to register the Compass tools on.
 */
export function registerCompass(server: McpServer): void {
  server.registerTool(
    "compass_index",
    {
      description:
        "Build or incrementally refresh the Compass — speclaw's local code graph (.speclaw/index.db). Parses TS/JS/Python with tree-sitter into nodes (definitions) and edges (calls/imports), and computes a local vector embedding per node for semantic recall. Files unchanged since the last run are skipped by content hash. Run once after init and whenever you want a fresh graph.",
      inputSchema: { projectPath: z.string().describe("Absolute path to the project") },
    },
    async ({ projectPath }) => text(await buildIndex(projectPath))
  );

  server.registerTool(
    "compass_explore",
    {
      description:
        "Explore a node in the Compass: returns its verbatim source, location, callees, and resolved callers (blast radius). Use this BEFORE grep/read when locating or understanding code. Requires compass_index to have run.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        node: z.string().describe("Exact node name to explore (function/class/method/type)"),
      },
    },
    async ({ projectPath, node }) => text(explore(projectPath, node))
  );

  server.registerTool(
    "compass_search",
    {
      description:
        "Structural search of the Compass: find nodes by name or keyword (substring match). Returns name, kind, and file:line per hit. Cheaper and more structural than grep. Requires compass_index to have run.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        query: z.string().describe("Name or keyword to search for"),
        limit: z.number().optional().describe("Max results (default 25)"),
      },
    },
    async ({ projectPath, query, limit }) => text(search(projectPath, query, limit ?? 25))
  );

  server.registerTool(
    "compass_recall",
    {
      description:
        "Semantic search of the Compass: describe what you're looking for in natural language ('where auth tokens are validated') and get the nodes ranked by meaning, using the local vector store — even when the identifier names don't contain your words. Requires compass_index to have run.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        query: z.string().describe("Natural-language description of the code you want"),
        limit: z.number().optional().describe("Max results (default 15)"),
      },
    },
    async ({ projectPath, query, limit }) => text(await recall(projectPath, query, limit ?? 15))
  );

  server.registerTool(
    "compass_impact",
    {
      description:
        "Blast radius: every node that transitively calls the target, up to a depth. Answers 'what could break if I change this?' before editing. Includes dynamic-dispatch callers (matched by name). Requires compass_index.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        node: z.string().describe("Node name whose dependents you want"),
        maxDepth: z.number().optional().describe("Max hops to traverse (default 4)"),
      },
    },
    async ({ projectPath, node, maxDepth }) => text(impact(projectPath, node, maxDepth ?? 4))
  );

  server.registerTool(
    "compass_trace",
    {
      description:
        "Trace a call path from one node to another: returns the chain of calls linking them (or null if none within depth). Useful to understand how an entrypoint reaches a sink. Requires compass_index.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        from: z.string().describe("Starting node name"),
        to: z.string().describe("Target node name"),
        maxDepth: z.number().optional().describe("Max hops to search (default 8)"),
      },
    },
    async ({ projectPath, from, to, maxDepth }) => text(trace(projectPath, from, to, maxDepth ?? 8))
  );

  server.registerTool(
    "compass_watch",
    {
      description:
        "Keep the Compass index fresh automatically: start/stop a file watcher that incrementally re-indexes on change (debounced). action=start|stop|status. Optional — the index is also refreshed on demand by compass_index.",
      inputSchema: {
        projectPath: z.string().describe("Absolute path to the project"),
        action: z.enum(["start", "stop", "status"]).describe("start, stop, or status"),
      },
    },
    async ({ projectPath, action }) => {
      const result =
        action === "start" ? startWatch(projectPath)
        : action === "stop" ? stopWatch(projectPath)
        : watchStatus(projectPath);
      return text(result);
    }
  );
}
