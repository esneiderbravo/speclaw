import { doctor } from "../../modules/foundation/doctor.js";
import { measureInstallBudget } from "../../modules/foundation/context-budget.js";
import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";

/** Verify the installation, printing each check and exiting non-zero on failure. */
export async function runDoctor(_flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const checks = doctor(cwd);
  ui.heading("speclaw doctor");
  for (const c of checks) {
    if (c.ok) ui.ok(`${c.name} — ${c.detail}`);
    else ui.err(`${c.name} — ${c.detail}`);
  }

  try {
    const m = measureInstallBudget(cwd);
    ui.ok(
      `context budget — profile ${m.profile} · ${m.toolCount} tools · ~${m.total} always-on tokens ` +
        `(A ${m.tools} · B ${m.skillsAndCommands} · C ${m.alwaysOnInstructions}; D path-scoped ${m.pathScoped} not in total)`,
    );
  } catch (err) {
    ui.warn(`context budget — could not measure: ${(err as Error).message}`);
  }

  const failed = checks.filter((c) => !c.ok).length;
  ui.plain();
  if (failed === 0) ui.ok("Everything is within the law.");
  else {
    ui.warn(`${failed} check(s) failed.`);
    process.exit(1);
  }
}
