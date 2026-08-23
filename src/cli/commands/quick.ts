import { Flags, list } from "../lib/args.js";
import { ui } from "../lib/ui.js";
import { scaffoldQuick } from "../../modules/lawbook/quick.js";

/**
 * Scaffold a level-0 change (`speclaw quick <name>`).
 *
 * @param flags - `_[0]` is the change name; optional `--path` / `--symbol` / `--json`.
 */
export async function runQuick(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const name = flags._[0];
  if (!name || typeof name !== "string") {
    ui.err("Usage: speclaw quick <name> [--path <file>] [--symbol <sym>] [--json]");
    process.exit(1);
  }
  try {
    const result = scaffoldQuick(cwd, name, {
      paths: list(flags.path),
      symbols: list(flags.symbol),
    });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    ui.ok(`level-0 change ${ui.code(result.change)} at ${result.dir}`);
    ui.info(result.proposal.rationale);
    if (result.proposal.level !== null && result.proposal.level > 0) {
      ui.warn(`measured proposal was level ${result.proposal.level} — promote if the fix grows`);
    }
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}
