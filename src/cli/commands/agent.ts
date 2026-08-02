import { AGENTS, agentById, configureAgent, detectConfiguredAgents } from "../../shared/agents.js";
import { emptyReport } from "../../shared/install.js";
import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";

/**
 * List configured agents or configure a new one (symlinks + MCP).
 *
 * @param flags - Parsed flags; `_[0]` is the subcommand (`list`/`add`) and `_[1]` the agent id.
 */
export async function runAgent(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const [sub, id] = flags._;

  if (sub === "list" || !sub) {
    const configured = new Set(detectConfiguredAgents(cwd));
    ui.heading("Agents");
    for (const a of AGENTS) {
      const mark = configured.has(a.id) ? ui.code("configured") : "—";
      console.log(`  ${a.id.padEnd(10)} ${a.label.padEnd(22)} ${mark}`);
    }
    ui.plain();
    ui.info("Add one:  speclaw agent add <id>");
    return;
  }

  if (sub === "add") {
    if (!id || !agentById(id)) {
      ui.err(`Usage: speclaw agent add <${AGENTS.map((a) => a.id).join("|")}>`);
      process.exit(1);
    }
    const report = emptyReport();
    configureAgent(cwd, id, report);
    ui.ok(`${agentById(id)!.label} configured`);
    for (const s of report.symlinks) ui.info(s);
    for (const w of report.written) ui.info(w);
    if (!report.symlinks.length && !report.written.length) {
      ui.warn("Nothing to do (already configured, or run `speclaw init` first).");
    }
    return;
  }

  ui.err(`Unknown: agent ${sub}. Use: agent list | agent add <id>`);
  process.exit(1);
}
