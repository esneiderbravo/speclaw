import { handleHarness, readHarness, type HarnessOp } from "../../modules/cortex/harness.js";
import { briefForStage } from "../../modules/cortex/brief.js";
import { Flags, repeated } from "../lib/args.js";
import { ui } from "../lib/ui.js";

const OPS = ["status", "start", "advance", "rework", "brief"] as const;

/**
 * Run `speclaw cortex <op> --change <name> […]`.
 *
 * @param flags - Parsed flags; `_[0]` is the op.
 */
export async function runCortex(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const opRaw = flags._[0];
  const op = opRaw as (typeof OPS)[number];
  if (!OPS.includes(op)) {
    ui.err(
      "Usage: speclaw cortex <status|start|advance|rework|brief> --change <name> [--verdict PASS|FAIL] [--question …] [--pause-questions] [--note …] [--json]",
    );
    process.exit(1);
  }
  const changeName =
    typeof flags.change === "string" ? flags.change : (flags._[1] as string | undefined);
  if (!changeName) {
    ui.err("Usage: speclaw cortex <op> --change <name>");
    process.exit(1);
  }

  try {
    if (op === "brief") {
      const state = readHarness(cwd, changeName);
      const brief = briefForStage(state?.stage ?? null);
      const result = { state, ...brief };
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const verdictRaw = typeof flags.verdict === "string" ? flags.verdict.toUpperCase() : undefined;
    const verdict =
      verdictRaw === "PASS" || verdictRaw === "FAIL" ? (verdictRaw as "PASS" | "FAIL") : undefined;
    const result = handleHarness({
      projectPath: cwd,
      change: changeName,
      harnessOp: op as HarnessOp,
      verdict: verdict ?? null,
      // Covers: req~harness-state~1
      openQuestions: repeated(flags.question),
      pauseForQuestions: Boolean(flags["pause-questions"]),
      note: typeof flags.note === "string" ? flags.note : undefined,
    });
    printHarnessWarnings(result);
    // The human line goes to stderr so stdout stays one JSON document.
    if (op === "status" && !flags.json && "summary" in result && result.summary) {
      process.stderr.write(`  ${result.summary.line}\n`);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}

/**
 * Print the Compass-first gate outcome of a harness result to stderr — the
 * `compassEvidence` count, then any warning — keeping stdout pure JSON.
 *
 * @param result - Any `handleHarness` result.
 */
export function printHarnessWarnings(result: object): void {
  const { compassEvidence: ev, warnings } = result as {
    compassEvidence?: { mode: string; stage: string; calls: number };
    warnings?: unknown;
  };
  if (ev) {
    process.stderr.write(
      `  compass-first: ${ev.calls} Compass evidence call(s) in stage "${ev.stage}" (compassGate: ${ev.mode})\n`,
    );
  }
  if (!Array.isArray(warnings)) return;
  for (const w of warnings) process.stderr.write(`  ! ${String(w)}\n`);
}
