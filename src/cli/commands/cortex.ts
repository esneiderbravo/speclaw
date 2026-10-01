import { handleHarness, readHarness, type HarnessOp } from "../../modules/cortex/harness.js";
import { briefForStage } from "../../modules/cortex/brief.js";
import { Flags, list } from "../lib/args.js";
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
      openQuestions: list(flags.question),
      pauseForQuestions: Boolean(flags["pause-questions"]),
      note: typeof flags.note === "string" ? flags.note : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}
