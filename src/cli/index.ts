#!/usr/bin/env node
import { parseFlags, REPEATABLE_FLAGS } from "./lib/args.js";
import { ui, header } from "./lib/ui.js";
import { maybeNotifyUpdate } from "./lib/update-check.js";
import { GLOBAL_HELP as HELP, helpFor, knownCommands, wantsHelp } from "./lib/help.js";

// Commands that open with the one-line branded header. These are the
// interactive, human-facing commands whose stdout is prose. Deliberately
// excluded: `version`/`--version`/`-v` (bare scriptable value), the Compass
// query family (`explore`/`search`/`recall`/`impact`/`trace`/`affected-tests`/
// `hotspots`/`coupling`, machine-consumed output), `quick` (often --json),
// `mcp` (a long-running stdio
// server), and `init` (already opens with the fuller `banner()`).
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
  "owners",
  "index",
  "watch",
  "lawbook",
  "cortex",
  "quick",
  "ship",
]);

/**
 * Print the branded header once, ahead of a command's output, when it is a
 * header-eligible command AND stdout is an interactive terminal (so pipes,
 * redirection, and CI stay clean — mirroring the color gate in `ui.ts`). A
 * forced-color signal counts as interactive so the header is exercisable in a
 * child process. `budget --json`, `doctor --json`, and `coverage` when emitting
 * TAP/JSON (or when stdout is not a TTY) are machine-consumed and suppress the
 * header. `session-start` and `reindex-file` are not header-eligible: they must print
 * nothing.
 */
function maybeHeader(cmd: string | undefined, flags: ReturnType<typeof parseFlags>): void {
  if (!process.stdout.isTTY && process.env.FORCE_COLOR !== "1") return;
  if (!HEADER_COMMANDS.has(cmd)) return;
  // A self-update child re-runs `update`; the parent already printed the header.
  if (cmd === "update" && process.env.SPECLAW_SELF_UPDATED) return;
  if (cmd === "budget" && flags.json) return;
  if (cmd === "doctor" && flags.json) return;
  if (cmd === "coverage" && (flags.json || flags.tap)) return;
  if (cmd === "drift" && flags.json) return;
  if (cmd === "quick" && flags.json) return;
  if (cmd === "index" && flags.json) return;
  if (cmd === "lawbook" && flags.json && flags._[0] === "level") return;
  if (cmd === "lawbook" && flags.json && flags._[0] === "investigate") return;
  if (cmd === "lawbook" && flags.json && flags._[0] === "draft") return;
  if (cmd === "cortex" && flags.json) return;
  header();
}

// The dispatcher's known commands come from the help registry, so a command
// without usage text is rejected here before it can ship.
const KNOWN_COMMANDS = knownCommands();

/** Run the handler for a single command. Returns when the command completes. */
async function dispatch(
  cmd: string | undefined,
  flags: ReturnType<typeof parseFlags>,
): Promise<void> {
  if (cmd !== undefined && !KNOWN_COMMANDS.has(cmd)) {
    ui.err(`Unknown command: ${cmd}`);
    console.log(HELP);
    process.exit(1);
  }
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
    case "session-start":
      return (await import("./commands/session-start.js")).runSessionStart();
    case "reindex-file":
      // Raw argv: the shared flag parser would read `-- <path>` as a flag value.
      return (await import("./commands/reindex-file.js")).runReindexFile(process.argv.slice(3));
    case "explore":
    case "search":
    case "recall":
    case "impact":
    case "trace":
    case "affected-tests":
    case "diff-context":
    case "hotspots":
    case "coupling":
      return (await import("./commands/query.js")).runQuery(cmd, flags);
    case "visualize":
      return (await import("./commands/visualize.js")).runVisualize(flags);
    case "quick":
      return (await import("./commands/quick.js")).runQuick(flags);
    case "ship":
      return (await import("./commands/ship.js")).runShip(flags);
    case "ship-on-stop":
      return (await import("./commands/ship-on-stop.js")).runShipOnStop();
    case "cortex":
      return (await import("./commands/cortex.js")).runCortex(flags);
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
    case "owners":
      return (await import("./commands/owners.js")).runOwners(flags);
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

/**
 * Parse argv, run the command, then surface an update notice if one is due.
 * `<command> --help` / `-h` short-circuits first: it prints the command's usage
 * and runs nothing — no header, no notifier, no handler, no file writes.
 */
async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  // Covers: req~per-command-help~1
  const usage = cmd !== undefined && wantsHelp(rest) ? helpFor(cmd) : null;
  if (usage !== null) {
    process.stdout.write(usage.endsWith("\n") ? usage : usage + "\n");
    process.exitCode = 0;
    return;
  }
  const flags = parseFlags(rest, REPEATABLE_FLAGS);
  maybeHeader(cmd, flags);
  await dispatch(cmd, flags);
  // The SessionStart and edit hooks must stay silent: no update notice either.
  if (cmd === "session-start" || cmd === "reindex-file" || cmd === "ship-on-stop") return;
  await maybeNotifyUpdate(cmd);
}

main().catch((err) => {
  ui.err((err as Error).message);
  process.exit(1);
});
