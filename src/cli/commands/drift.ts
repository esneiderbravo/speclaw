import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";
import {
  buildDriftReport,
  parseFailOn,
  renderDriftAgent,
  renderDriftTable,
} from "../../modules/lawbook/drift.js";

/**
 * Report deterministic spec↔code drift, or reseal anchors from current bodies.
 *
 * Flags: `--json`, `--capability <name>`, `--fail-on <level>`, `--reverse`,
 * `--reseal`, `--explain`. Default `--fail-on semantic`. Exit 0/1/2.
 */
export async function runDrift(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const failOn = parseFailOn(flags["fail-on"]);
  if (failOn === null) {
    ui.err(`--fail-on must be none, cosmetic, semantic, or any.`);
    process.exitCode = 2;
    return;
  }
  const capability = typeof flags.capability === "string" ? flags.capability : undefined;
  const report = buildDriftReport(cwd, {
    capability,
    failOn,
    reverse: Boolean(flags.reverse),
    reseal: Boolean(flags.reseal),
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else if (!process.stdout.isTTY) {
    process.stdout.write(renderDriftAgent(report) + "\n");
  } else {
    ui.heading("speclaw drift");
    console.log(renderDriftTable(report));
    if (flags.explain) {
      ui.plain();
      console.log(renderDriftAgent(report, 50));
    }
  }

  process.exitCode = report.summary.exitCode;
}
