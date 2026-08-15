import { Flags, list } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";
import { BatchEngine, verifyLaws } from "../../modules/foundation/verify.js";

/**
 * `speclaw laws <subcommand>` — the CLI twin of the batch law tools. Today it
 * exposes `verify`, the twin of the `law_verify` MCP tool: it runs the project's
 * deterministic `deps`/`graph` laws against the Compass index and prints the
 * four-state result. Both transports delegate to the same {@link verifyLaws}
 * core, so the CLI and the tool never diverge.
 *
 * - `laws verify [--engine deps,graph] [--path a,b] [--law id1,id2] [--json]`
 *
 * @param flags - Parsed CLI flags; `flags._[0]` is the subcommand.
 */
export async function runLaws(flags: Flags): Promise<void> {
  const sub = flags._[0];
  if (sub !== "verify") {
    ui.err(`Unknown laws subcommand: ${sub ?? "(none)"} — try ${ui.code("speclaw laws verify")}.`);
    process.exit(1);
  }

  const engines = list(flags.engine).filter((e): e is BatchEngine => e === "deps" || e === "graph");
  const report = verifyLaws({
    projectPath: process.cwd(),
    paths: list(flags.path).length ? list(flags.path) : undefined,
    engines: engines.length ? engines : undefined,
    lawIds: list(flags.law).length ? list(flags.law) : undefined,
  });

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { summary } = report;
  ui.heading("speclaw laws verify");
  ui.info(
    `${summary.passed} passed · ${c.red(String(summary.failed))} failed · ` +
      `${summary.skipped} skipped · ${summary.unknown} unknown ` +
      `(${report.elapsedMs.toFixed(1)} ms)`,
  );
  for (const f of report.findings) {
    const at = f.line ? `${f.file}:${f.line}` : f.file;
    ui.warn(`${c.cream(f.lawId)} — ${at}${f.detail ? ` ${f.detail}` : ""}`);
  }
  for (const u of report.unknown) ui.plain(`  ? ${c.cream(u.lawId)} — ${u.detail}`);
  for (const s of report.skipped) {
    ui.plain(`  – ${c.cream(s.lawId)} — skipped: ${s.reason}${s.detail ? ` (${s.detail})` : ""}`);
  }
  if (report.findings.length === 0 && summary.evaluated > 0) ui.ok("No violations.");
}
