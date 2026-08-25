import { Flags, list } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";
import { BatchEngine, verifyLaws } from "../../modules/foundation/verify.js";
import { compileLaws } from "../../modules/foundation/compile-laws.js";
import { importRulesFrom } from "../../modules/foundation/import-rules.js";

/**
 * `speclaw laws <subcommand>` — verify (batch), compile (dialects), import (draft).
 *
 * @param flags - Parsed CLI flags; `flags._[0]` is the subcommand.
 */
export async function runLaws(flags: Flags): Promise<void> {
  const sub = flags._[0];
  if (sub === "compile") {
    const agents = list(flags.agent);
    const report = compileLaws({
      projectPath: process.cwd(),
      agents: agents.length ? agents : undefined,
    });
    if (flags.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    ui.heading("speclaw laws compile");
    ui.ok(
      `${report.lawCount} active · ${report.draftCount} draft · ` +
        `${report.written.length} written · ${report.unchanged.length} unchanged` +
        (report.failed.length ? ` · ${report.failed.length} failed` : ""),
    );
    for (const f of report.failed) ui.warn(`${f.path}: ${f.error}`);
    if (report.failed.length) process.exit(1);
    return;
  }

  if (sub === "import") {
    const from = typeof flags.from === "string" ? flags.from : "";
    if (!from) {
      ui.err(`Usage: ${ui.code("speclaw laws import --from rulesync")}`);
      process.exit(1);
    }
    try {
      const report = importRulesFrom(process.cwd(), from);
      if (flags.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      ui.heading("speclaw laws import");
      ui.ok(`${report.imported.length} imported · ${report.skipped.length} skipped`);
      for (const id of report.imported) ui.plain(`  + ${c.cream(id)}`);
    } catch (err) {
      ui.err((err as Error).message);
      process.exit(1);
    }
    return;
  }

  if (sub !== "verify") {
    ui.err(
      `Unknown laws subcommand: ${sub ?? "(none)"} — try ${ui.code("speclaw laws verify|compile|import")}.`,
    );
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
