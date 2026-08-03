import { specInit, specValidate, specSync, specArchive, specList } from "../../modules/lawbook/engine.js";
import { Flags } from "../lib/args.js";
import { ui } from "../lib/ui.js";

function today(): string {
  // The MCP path passes the date in; the CLL runs on a real machine, so read it here.
  return new Date().toISOString().slice(0, 10);
}

/**
 * Run a spec-workflow subcommand: init, list, validate, sync, or archive.
 *
 * @param flags - Parsed flags; `_[0]` is the subcommand and `_[1]` the change name where required.
 * @throws Exits the process with code 1 on unknown subcommands, missing arguments, or engine errors.
 */
export async function runSpec(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const [sub, change] = flags._;
  try {
    switch (sub) {
      case "init": {
        const r = specInit(cwd);
        ui.ok(r.alreadyExisted ? "lawbook/ already present" : `lawbook/ created (${r.created.length} entries)`);
        return;
      }
      case "list": {
        const r = specList(cwd);
        if (!r.initialized) return ui.warn("No lawbook/ — run `speclaw lawbook init`.");
        ui.heading("Lawbook workspace");
        ui.info(`active changes: ${r.activeChanges.join(", ") || "none"}`);
        ui.info(`archived: ${r.archivedChanges.join(", ") || "none"}`);
        ui.info(`capabilities: ${r.capabilities.join(", ") || "none"}`);
        return;
      }
      case "validate": {
        const r = specValidate(cwd, req(change, "spec validate <change>"));
        if (r.valid) ui.ok(`${r.change} is valid (${r.deltaSpecs.length} delta spec(s))`);
        else {
          ui.warn(`${r.change} has ${r.issues.length} issue(s):`);
          r.issues.forEach((i) => ui.info(i));
        }
        return;
      }
      case "sync": {
        const r = specSync(cwd, req(change, "spec sync <change>"));
        ui.ok(`promoted ${r.promoted.length} spec(s)`);
        r.promoted.forEach((p) => ui.info(p));
        return;
      }
      case "archive": {
        const r = specArchive(cwd, req(change, "spec archive <change>"), today());
        ui.ok(`archived to ${r.archivedTo} (${r.promoted.length} spec(s) promoted)`);
        return;
      }
      default:
        ui.err("Usage: speclaw lawbook <init|list|validate|sync|archive> [change]");
        process.exit(1);
    }
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}

/** Return the value or print a usage error and exit if it is missing. */
function req(value: string | undefined, usage: string): string {
  if (!value) {
    ui.err(`Usage: speclaw ${usage}`);
    process.exit(1);
  }
  return value;
}
