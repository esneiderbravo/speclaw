import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";
import { checkOwners, writeOwners } from "../../modules/team/owners.js";

/**
 * Spec-ownership CLI: compile `team.owners` into `.github/CODEOWNERS`.
 * `--write` mutates; default / `--check` reports drift without writing.
 */
// Covers: req~owners-cli~1
export async function runOwners(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const doWrite = Boolean(flags.write);

  if (doWrite) {
    try {
      const result = writeOwners(cwd);
      if (!result.written) {
        ui.info(result.reason ?? "nothing to write");
        return;
      }
      ui.ok(
        `wrote speclaw owners block (${result.capabilities} key(s)) → ${result.path.replace(
          cwd + "/",
          "",
        )}`,
      );
      return;
    } catch (err) {
      ui.err((err as Error).message);
      process.exit(1);
    }
  }

  const check = checkOwners(cwd);
  if (check.ok) {
    ui.ok(check.detail);
    return;
  }
  ui.err(check.detail);
  if (check.expected !== undefined && flags.diff) {
    ui.plain();
    ui.step("expected");
    console.log(check.expected);
    ui.plain();
    ui.step("actual");
    console.log(check.actual ?? "(missing)");
  } else {
    ui.info(
      `Run ${ui.code("speclaw owners --write")} to refresh, or ${ui.code("--diff")} to compare.`,
    );
  }
  process.exit(1);
}
