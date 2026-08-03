#!/usr/bin/env node
import { parseFlags } from "./lib/args.js";
import { ui } from "./lib/ui.js";

const HELP = `speclaw — spec-driven, agent-ready projects (foundation + Compass + Spec)

Usage: speclaw <command> [options]

Setup
  init                     Interactive setup: pick agents, scaffold, index, get the prompt
  agent list               Show which agents are configured
  agent add <id>           Configure another agent later (symlinks + MCP)

Compass (code intelligence — the same surface agents use via MCP)
  index                    (Re)build the local code graph, with progress
  watch                    Keep the index fresh on file changes
  explore <node>           A node's source + callers/callees
  search <query>           Find nodes by name/keyword
  recall "<query>"         Find code by meaning (semantic)
  impact <node>            Blast radius: everything that (transitively) calls it
  trace <from> <to>        A call path between two nodes
  visualize [node]         Interactive HTML graph → .speclaw/graph.html

Lawbook (spec-driven workflow)
  lawbook init             Create the lawbook/ workspace
  lawbook list             Active/archived changes and capabilities
  lawbook validate <c>     Validate a change's artifacts
  lawbook sync <c>         Promote delta specs to canonical
  lawbook archive <c>      Finalize and archive a change

Other
  doctor                   Verify the installation
  mcp                      Start the MCP server (used by your agent's config)
  help                     Show this help
`;

/** Parse argv and dispatch to the matching command handler. */
async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    case "mcp": {
      const { startMcpServer } = await import("../server.js");
      await startMcpServer();
      return;
    }
    case "init":
      return (await import("./commands/init.js")).runInit(flags);
    case "agent":
      return (await import("./commands/agent.js")).runAgent(flags);
    case "index":
      return (await import("./commands/index-build.js")).runIndex(flags);
    case "watch":
      return (await import("./commands/index-build.js")).runWatch(flags);
    case "explore":
    case "search":
    case "recall":
    case "impact":
    case "trace":
      return (await import("./commands/query.js")).runQuery(cmd, flags);
    case "visualize":
      return (await import("./commands/visualize.js")).runVisualize(flags);
    case "lawbook":
      return (await import("./commands/lawbook.js")).runSpec(flags);
    case "doctor":
      return (await import("./commands/doctor.js")).runDoctor(flags);
    default:
      ui.err(`Unknown command: ${cmd}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  ui.err((err as Error).message);
  process.exit(1);
});
