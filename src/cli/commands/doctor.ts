import { doctor } from "../../modules/foundation/doctor.js";
import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";

/** Verify the installation, printing each check and exiting non-zero on failure. */
export async function runDoctor(_flags: Flags): Promise<void> {
  const checks = doctor(process.cwd());
  ui.heading("speclaw doctor");
  for (const c of checks) {
    if (c.ok) ui.ok(`${c.name} — ${c.detail}`);
    else ui.err(`${c.name} — ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  ui.plain();
  if (failed === 0) ui.ok("Everything is within the law.");
  else {
    ui.warn(`${failed} check(s) failed.`);
    process.exit(1);
  }
}
