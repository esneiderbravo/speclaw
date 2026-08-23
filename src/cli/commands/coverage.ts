import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";
import {
  applyAdopt,
  buildCoverageReport,
  coverageExitCode,
  loadCoverageConfig,
  proposeAdopt,
  renderCoverageAgent,
  renderCoverageTable,
  renderCoverageTap,
} from "../../modules/lawbook/coverage.js";

/**
 * Report requirement → impl → test coverage, or propose/apply id adoption.
 *
 * Flags: `--json`, `--tap`, `--adopt`, `--write`, `--change <name>`.
 * Exit codes: 0 clean / no ids, 1 gated defects, 2 invocation error.
 */
export async function runCoverage(flags: Flags): Promise<void> {
  const cwd = process.cwd();

  if (flags.adopt) {
    const proposals = proposeAdopt(cwd);
    if (proposals.length === 0) {
      ui.ok("Every requirement already has an identifier.");
      return;
    }
    if (flags.write) {
      const result = applyAdopt(cwd, proposals, { write: true });
      ui.ok(`Wrote identifiers into ${result.written.length} file(s) (.bak backups kept).`);
      for (const p of proposals) {
        ui.plain(
          `  ${p.specPath}:${p.line}  ${p.title} → ${p.proposedId}${p.collision ? " (disambiguated)" : ""}`,
        );
      }
      return;
    }
    ui.heading("coverage --adopt (dry run)");
    for (const p of proposals) {
      ui.plain(
        `  ${p.specPath}:${p.line}  ${p.title} → ${p.proposedId}${p.collision ? " (disambiguated)" : ""}`,
      );
    }
    ui.plain();
    ui.info(`Re-run with ${ui.code("--adopt --write")} to apply (backs up to .bak).`);
    return;
  }

  const change = typeof flags.change === "string" ? flags.change : undefined;
  const cfg = loadCoverageConfig(cwd);
  const report = buildCoverageReport(cwd, { change, cfg });

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else if (flags.tap || !process.stdout.isTTY) {
    process.stdout.write(renderCoverageTap(report) + "\n");
  } else {
    ui.heading("speclaw coverage");
    console.log(renderCoverageTable(report));
    ui.plain();
    console.log(renderCoverageAgent(report, true));
  }

  process.exitCode = coverageExitCode(report, cfg);
}
