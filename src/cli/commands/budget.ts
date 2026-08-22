import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";
import { formatBudgetTable } from "../../shared/budget.js";
import { loadDeclaredBudget } from "../../shared/exposure.js";
import { measureInstallBudget } from "../../modules/foundation/context-budget.js";

/** Print the context-budget table or JSON. */
export async function runBudget(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const minimal = flags.minimal === true ? true : flags.minimal === false ? false : undefined;
  const measurement = measureInstallBudget(cwd, minimal);
  const declared = loadDeclaredBudget();

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          profile: measurement.profile,
          tools: measurement.tools,
          skillsAndCommands: measurement.skillsAndCommands,
          alwaysOnInstructions: measurement.alwaysOnInstructions,
          pathScoped: measurement.pathScoped,
          total: measurement.total,
          toolCount: measurement.toolCount,
          declared: {
            tools: declared.surfaces.tools,
            skillsAndCommands: declared.surfaces.skillsAndCommands,
            alwaysOnInstructions: declared.surfaces.alwaysOnInstructions,
            total: measurement.profile === "minimal" ? declared.minimal.total : declared.total,
          },
          details: measurement.details,
        },
        null,
        2,
      ),
    );
    return;
  }

  ui.heading("speclaw budget");
  console.log(formatBudgetTable(measurement, declared));
  ui.plain();
  ui.info(`profile: ${measurement.profile} · tools registered: ${measurement.toolCount}`);
  ui.info("Spec Kit (commands only), for comparison: ~18,600 — github/spec-kit#1401");
}
