import { Flags, list } from "../lib/args.js";
import { ui } from "../lib/ui.js";
import { shipChange } from "../../modules/lawbook/ship.js";

/**
 * Fast path for finished work (`speclaw ship <name>`): gates once, a report
 * from their real output, and the archive at level 0.
 *
 * @param flags - `_[0]` is the change name; `--summary`, `--gate`, `--discipline`, `--no-archive`, `--json`.
 */
export async function runShip(flags: Flags): Promise<void> {
  const name = flags._[0];
  if (!name || typeof name !== "string") {
    ui.err("Usage: speclaw ship <name> [--summary <text>] [--gate <cmd>] [--discipline <name>]");
    process.exit(1);
  }
  const gates = list(flags.gate);
  const result = shipChange(process.cwd(), name, {
    summary: typeof flags.summary === "string" ? flags.summary : undefined,
    gates: gates.length ? gates : undefined,
    discipline: typeof flags.discipline === "string" ? flags.discipline : undefined,
    noArchive: Boolean(flags["no-archive"]),
  });
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const g of result.gates) {
      const t = `${(g.durationMs / 1000).toFixed(1)} s`;
      if (g.exitCode === 0) ui.ok(`${g.command} (${t})`);
      else ui.err(`${g.command} failed, exit ${g.exitCode} (${t})`);
    }
    if (result.report) ui.ok(`report ${ui.code(result.report)}`);
    if (result.archivedTo) ui.ok(`archived to ${result.archivedTo}`);
    for (const n of result.next) ui.warn(n);
    const s = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;
    ui.info(
      `speclaw overhead ${s(result.timings.overhead)} · gates ${s(result.timings.gates)} · total ${s(result.timings.total)}`,
    );
  }
  if (!result.gatesPassed) process.exit(1);
}
