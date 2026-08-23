#!/usr/bin/env node
import { parseFlags } from "./lib/args.js";
import { ui, header } from "./lib/ui.js";
import { maybeNotifyUpdate } from "./lib/update-check.js";

const HELP = `speclaw — spec-driven, agent-ready projects (foundation + Compass + Lawbook)

Usage: speclaw <command> [options]

Install globally so the command is always available:
  npm i -g @esneiderbravo/speclaw

Setup
  init                     Interactive setup: pick agents, scaffold, index, get the prompt
                           (--minimal omits setup/lifecycle MCP tools)
  update                   Upgrade speclaw and apply only what's new (no re-init)
                           (--minimal persists minimal exposure; omit to keep prior)
  agent list               Show which agents are configured
  agent add <id>           Configure another agent later (symlinks + MCP)

Compass (code intelligence — the same surface agents use via MCP)
  index                    (Re)build the local code graph, with progress
  watch                    Keep the index fresh on file changes
  explore <node>           A node's source + callers/callees
  search <query>           Find nodes by name/keyword
  recall "<query>"         Find code by meaning (semantic)
  impact <node>            Blast radius (grouped by module; --flat / --json)
  affected-tests           Tests affected by a change (--file / --from-diff / --json)
  trace <from> <to>        A call path between two nodes
  visualize [node]         Interactive HTML graph → .speclaw/graph.html

Lawbook (spec-driven workflow)
  lawbook init             Create the lawbook/ workspace
  lawbook list             Active/archived changes and capabilities
  lawbook validate <c>     Validate a change's artifacts
  lawbook sync <c>         Promote delta specs to canonical
  lawbook archive <c>      Finalize and archive a change

Other
  doctor                   Verify the installation (--json, --offline, --strict)
  budget                   Measure always-on context cost (tools, skills, instructions)
  coverage                 Requirement → impl → test coverage (--json, --tap, --adopt, --write)
  drift                    Spec↔code drift (--json, --reseal, --reverse, --fail-on)
  telemetry status         Confirm speclaw ships no telemetry
  check                    Evaluate an action against the laws (hooks call this; --dry-run to preview)
  laws verify              Verify the deterministic dependency/graph laws against the index
  verify                   Verify laws for CI: exit codes, --sarif, --json, --strict-engines
  mcp                      Start the MCP server (used by your agent's config)
  help                     Show this help
  --version                Print the installed speclaw version
`;

// Commands that open with the one-line branded header. These are the
// interactive, human-facing commands whose stdout is prose. Deliberately
// excluded: `version`/`--version`/`-v` (bare scriptable value), the Compass
// query family (`explore`/`search`/`recall`/`impact`/`trace`/`affected-tests`,
// machine-consumed output), `mcp` (a long-running stdio server), and `init`
// (already opens with the fuller `banner()`).
const HEADER_COMMANDS = new Set<string | undefined>([
  undefined,
  "help",
  "--help",
  "-h",
  "update",
  "agent",
  "doctor",
  "budget",
  "coverage",
  "drift",
  "telemetry",
  "index",
  "watch",
  "lawbook",
]);

/**
 * Print the branded header once, ahead of a command's output, when it is a
 * header-eligible command AND stdout is an interactive terminal (so pipes,
 * redirection, and CI stay clean — mirroring the color gate in `ui.ts`). A
 * forced-color signal counts as interactive so the header is exercisable in a
 * child process. `budget --json`, `doctor --json`, and `coverage` when emitting
 * TAP/JSON (or when stdout is not a TTY) are machine-consumed and suppress the
 * header.
 */
function maybeHeader(cmd: string | undefined, flags: ReturnType<typeof parseFlags>): void {
  if (!process.stdout.isTTY && process.env.FORCE_COLOR !== "1") return;
  if (!HEADER_COMMANDS.has(cmd)) return;
  if (cmd === "budget" && flags.json) return;
  if (cmd === "doctor" && flags.json) return;
  if (cmd === "coverage" && (flags.json || flags.tap)) return;
  if (cmd === "drift" && flags.json) return;
  header();
}

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
    case "affected-tests":
      return (await import("./commands/query.js")).runQuery(cmd, flags);
    case "visualize":
      return (await import("./commands/visualize.js")).runVisualize(flags);
    case "lawbook":
      return (await import("./commands/lawbook.js")).runSpec(flags);
    case "doctor":
      return (await import("./commands/doctor.js")).runDoctor(flags);
    case "budget":
      return (await import("./commands/budget.js")).runBudget(flags);
    case "coverage":
      return (await import("./commands/coverage.js")).runCoverage(flags);
    case "drift":
      return (await import("./commands/drift.js")).runDrift(flags);
    case "telemetry":
      return (await import("./commands/telemetry.js")).runTelemetry(flags);
    case "check":
      return (await import("./commands/check.js")).runCheck(flags);
    case "laws":
      return (await import("./commands/laws.js")).runLaws(flags);
    case "verify":
      return (await import("./commands/verify.js")).runVerify(flags);
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
  maybeHeader(cmd, flags);
  await dispatch(cmd, flags);
  await maybeNotifyUpdate(cmd);
}

main().catch((err) => {
  ui.err((err as Error).message);
  process.exit(1);
});
