#!/usr/bin/env node
import { parseFlags } from "./lib/args.js";
import { ui } from "./lib/ui.js";
import { maybeNotifyUpdate } from "./lib/update-check.js";

const HELP = `speclaw — spec-driven, agent-ready projects (foundation + Compass + Lawbook)

Usage: speclaw <command> [options]

Install globally so the command is always available:
  npm i -g @esneiderbravo/speclaw

Setup
  init                     Interactive setup: pick agents, scaffold, index, get the prompt
  update                   Upgrade speclaw and apply only what's new (no re-init)
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
  --version                Print the installed speclaw version
`;

/** Run the handler for a single command. Returns when the command completes. */
async function dispatch(
  cmd: string | undefined,
  flags: ReturnType<typeof parseFlags>,
): Promise<void> {
  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    case "version":
    case "--version":
    case "-v":
      return (await import("./commands/version.js")).runVersion();
    case "mcp": {
      const { startMcpServer } = await import("../server.js");
      await startMcpServer();
      return;
    }
    case "init":
      return (await import("./commands/init.js")).runInit(flags);
    case "update":
      return (await import("./commands/update.js")).runUpdate(flags);
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

/** Parse argv, run the command, then surface an update notice if one is due. */
async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  await dispatch(cmd, flags);
  await maybeNotifyUpdate(cmd);
}

main().catch((err) => {
  ui.err((err as Error).message);
  process.exit(1);
});
