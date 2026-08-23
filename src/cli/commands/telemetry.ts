import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";

/**
 * Telemetry posture command. speclaw ships **no** telemetry code — `status`
 * says so; enable/disable/log are rejected.
 */
export async function runTelemetry(flags: Flags): Promise<void> {
  const sub = flags._[0] ?? "status";
  if (sub === "status") {
    ui.ok("speclaw includes no telemetry — nothing is collected or transmitted.");
    ui.plain("Policy: 100% local. There is no enable path and no analytics endpoint.");
    return;
  }
  ui.err(
    `telemetry ${sub} is unavailable: speclaw does not include telemetry. ` +
      "Run `speclaw telemetry status`.",
  );
  process.exit(1);
}
