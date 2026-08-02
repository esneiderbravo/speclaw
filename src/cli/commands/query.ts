import { explore, search, recall, impact, trace } from "../../modules/compass/query.js";
import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";

/**
 * Run a Compass query from the shell — the same surface agents call via MCP.
 *
 * @param cmd - The query verb: `explore`, `search`, `recall`, `impact`, or `trace`.
 * @param flags - Parsed flags supplying the positional query arguments in `_`.
 * @throws Exits the process with code 1 on missing arguments or query errors.
 */
export async function runQuery(cmd: string, flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const args = flags._;
  try {
    switch (cmd) {
      case "explore": {
        const r = explore(cwd, need(args[0], "explore <node>"));
        if (!r.found) {
          ui.warn(r.message ?? "not found");
          r.otherMatches?.forEach((m) => ui.info(`${m.name} (${m.kind}) ${m.file}:${m.line}`));
          return;
        }
        const s = r.symbol!;
        ui.heading(`${s.kind} ${s.name}  ${s.file}:${s.startLine}-${s.endLine}`);
        console.log(s.source);
        ui.heading("Callees");
        r.callees?.forEach((c) => ui.info(`${c.name}${c.file ? ` (${c.file}:${c.line})` : ""}`));
        ui.heading("Callers");
        r.callers?.forEach((c) => ui.info(`${c.name} (${c.file}:${c.line})`));
        return;
      }
      case "search": {
        const hits = search(cwd, need(args[0], "search <query>"));
        ui.heading(`${hits.length} result(s)`);
        hits.forEach((h) => ui.info(`${h.name} (${h.kind}) ${h.file}:${h.line}`));
        return;
      }
      case "recall": {
        const hits = await recall(cwd, need(args[0], 'recall "<query>"'));
        ui.heading(`${hits.length} result(s) by meaning`);
        hits.forEach((h) => ui.info(`${h.score.toFixed(3)}  ${h.name} (${h.kind}) ${h.file}:${h.line}`));
        return;
      }
      case "impact": {
        const nodes = impact(cwd, need(args[0], "impact <node>"));
        ui.heading(`Blast radius: ${nodes.length} dependent(s)`);
        nodes.forEach((n) => ui.info(`depth ${n.depth}: ${n.name} (${n.file}:${n.line})`));
        return;
      }
      case "trace": {
        const r = trace(cwd, need(args[0], "trace <from> <to>"), need(args[1], "trace <from> <to>"));
        ui.heading(`Trace ${r.from} → ${r.to}`);
        console.log(r.path ? "  " + r.path.join(" → ") + `  (${r.hops} hops)` : "  no path found");
        return;
      }
    }
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}

/** Return the value or print a usage error and exit if it is missing. */
function need(value: string | undefined, usage: string): string {
  if (!value) {
    ui.err(`Usage: speclaw ${usage}`);
    process.exit(1);
  }
  return value;
}
