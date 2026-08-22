import { doctor, type DoctorReport } from "../../modules/foundation/doctor.js";
import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";

const STATUS_MARK: Record<string, string> = {
  ok: "ok",
  warn: "warn",
  error: "error",
  skip: "skip",
};

function printHuman(report: DoctorReport): void {
  ui.heading("speclaw doctor");
  for (const section of report.sections) {
    ui.plain();
    ui.ok(`${section.id}  [${STATUS_MARK[section.status]}]`);
    for (const c of section.checks) {
      const line = `${c.title.padEnd(24)} ${c.detail ?? c.status}`;
      if (c.status === "ok" || c.status === "skip") ui.ok(`  ${line}`);
      else if (c.status === "warn") {
        ui.warn(`  ${line}`);
        if (c.remedy) ui.plain(`      → ${c.remedy}`);
      } else {
        ui.err(`  ${line}`);
        if (c.remedy) ui.plain(`      → ${c.remedy}`);
      }
    }
  }
  ui.plain();
  const warns = report.sections.flatMap((s) => s.checks).filter((c) => c.status === "warn").length;
  const errs = report.sections.flatMap((s) => s.checks).filter((c) => c.status === "error").length;
  if (errs === 0 && warns === 0) ui.ok("Everything is within the law.");
  else if (errs === 0) {
    ui.warn(`${warns} warning(s). Run \`speclaw doctor --json\` and paste it into an issue.`);
  } else {
    ui.err(`${errs} error(s), ${warns} warning(s).`);
  }
}

/**
 * Verify the installation. Supports `--json`, `--offline`, `--strict`,
 * `--redact` (default) / `--no-redact`.
 */
export async function runDoctor(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const redact = flags["no-redact"] ? false : true;
  const report = await doctor(cwd, {
    offline: Boolean(flags.offline),
    redact,
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    printHuman(report);
  }

  const strict = Boolean(flags.strict);
  if (report.status === "error" || (strict && report.status === "warn")) {
    process.exit(1);
  }
}
