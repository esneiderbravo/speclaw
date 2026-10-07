import {
  specInit,
  specValidate,
  specSync,
  specArchive,
  specList,
} from "../../modules/lawbook/engine.js";
import { handleLevel } from "../../modules/lawbook/quick.js";
import { scaffoldBugfix } from "../../modules/lawbook/bugfix.js";
import { scaffoldFeature } from "../../modules/lawbook/scaffold-change.js";
import { investigate, formatInvestigateResult } from "../../modules/lawbook/investigate.js";
import { handleHarness } from "../../modules/cortex/harness.js";
import { printHarnessWarnings } from "./cortex.js";
import { Flags, list } from "../lib/args.js";
import { ui } from "../lib/ui.js";

function today(): string {
  // The MCP path passes the date in; the CLL runs on a real machine, so read it here.
  return new Date().toISOString().slice(0, 10);
}

/**
 * Run a spec-workflow subcommand: init, list, validate, sync, archive, or level.
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
        ui.ok(
          r.alreadyExisted
            ? "lawbook/ already present"
            : `lawbook/ created (${r.created.length} entries)`,
        );
        return;
      }
      case "list": {
        const r = specList(cwd);
        if (!r.initialized) return ui.warn("No lawbook/ — run `speclaw lawbook init`.");
        ui.heading("Lawbook workspace");
        if (r.activeChanges.length === 0) ui.info("active changes: none");
        else {
          ui.info("active changes:");
          for (const name of r.activeChanges) {
            const lvl = r.activeLevels[name] ?? 3;
            ui.info(`  ${name}  (level ${lvl})`);
          }
        }
        ui.info(`archived: ${r.archivedChanges.join(", ") || "none"}`);
        ui.info(`capabilities: ${r.capabilities.join(", ") || "none"}`);
        return;
      }
      case "level": {
        const modeRaw = change ?? "propose";
        const mode = modeRaw as "propose" | "set" | "promote" | "explain";
        if (!["propose", "set", "promote", "explain"].includes(mode)) {
          ui.err(
            "Usage: speclaw lawbook level <propose|set|promote|explain> [--change <c>] [--path …] [--level N] [--reason …] [--json]",
          );
          process.exit(1);
        }
        const levelFlag = flags.level;
        const level =
          levelFlag === undefined || levelFlag === true
            ? undefined
            : (Number(levelFlag) as 0 | 1 | 2 | 3);
        const result = handleLevel({
          projectPath: cwd,
          mode,
          change: typeof flags.change === "string" ? flags.change : flags._[2],
          paths: list(flags.path),
          symbols: list(flags.symbol),
          level,
          reason: typeof flags.reason === "string" ? flags.reason : undefined,
        });
        if (flags.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      case "validate": {
        // Covers: req~ears-cli-surface~1
        const r = specValidate(cwd, req(change, "lawbook validate <change>"));
        if (r.valid) ui.ok(`${r.change} is valid (${r.deltaSpecs.length} delta spec(s))`);
        else {
          ui.warn(`${r.change} has ${r.issues.length} issue(s):`);
          r.issues.forEach((i) => ui.info(i));
        }
        if (r.warnings.length > 0) {
          ui.warn(`${r.warnings.length} advisory warning(s):`);
          r.warnings.forEach((w) => ui.info(w));
        }
        return;
      }
      case "sync": {
        const r = specSync(cwd, req(change, "lawbook sync <change>"));
        ui.ok(`promoted ${r.promoted.length} spec(s)`);
        r.promoted.forEach((p) =>
          ui.info(`${r.created.includes(p) ? "created" : "updated"}: ${p}`),
        );
        return;
      }
      case "investigate": {
        const stackTrace =
          typeof flags["stack-trace"] === "string"
            ? flags["stack-trace"]
            : typeof flags.stackTrace === "string"
              ? flags.stackTrace
              : undefined;
        const symptom = typeof flags.symptom === "string" ? flags.symptom : undefined;
        const result = await investigate({
          projectPath: cwd,
          stackTrace,
          symptom,
          hintPaths: list(flags.path),
          maxSuspects:
            flags.max !== undefined && flags.max !== true ? Number(flags.max) : undefined,
        });
        if (flags.json) {
          console.log(formatInvestigateResult(result));
          return;
        }
        console.log(formatInvestigateResult(result));
        return;
      }
      case "draft": {
        const levelFlag = flags.level;
        const level =
          levelFlag === undefined || levelFlag === true ? undefined : parseLevel(levelFlag);
        if (flags.bug) {
          const name =
            typeof flags.bug === "string" ? flags.bug : req(change, "lawbook draft --bug <name>");
          const result = scaffoldBugfix(cwd, name, { level });
          if (flags.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          ui.ok(`bug change "${name}" scaffolded at ${result.dir}`);
          return;
        }
        const name = req(
          change,
          "lawbook draft <name> [--level N] [--capability C] [--json] | --bug <name>",
        );
        const result = scaffoldFeature(cwd, name, {
          level,
          reason: typeof flags.reason === "string" ? flags.reason : undefined,
          capability: typeof flags.capability === "string" ? flags.capability : undefined,
        });
        if (flags.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        ui.ok(
          `feature change "${name}" scaffolded at ${result.dir} ` +
            (result.level === null
              ? "(level unconfirmed — run `speclaw lawbook level set`)"
              : `(level ${result.level})`),
        );
        return;
      }
      case "archive": {
        const r = specArchive(cwd, req(change, "lawbook archive <change>"), today());
        ui.ok(`archived to ${r.archivedTo} (${r.promoted.length} spec(s) promoted)`);
        r.promoted.forEach((p) =>
          ui.info(`${r.created.includes(p) ? "created" : "updated"}: ${p}`),
        );
        for (const s of r.seals) {
          const msg = `sealed ${s.capability}: ${s.unique} unique / ${s.ambiguous} ambiguous / ${s.unresolved} unresolved → ${s.path}`;
          if (s.warned) ui.warn(msg + " (no resolvable anchors)");
          else ui.info(msg);
        }
        if (r.harnessCompleted) ui.ok("Cortex harness completed (stage done)");
        return;
      }
      case "harness": {
        const opRaw = change;
        const op = opRaw as "status" | "start" | "advance" | "rework";
        if (!["status", "start", "advance", "rework"].includes(op)) {
          ui.err(
            "Usage: speclaw lawbook harness <status|start|advance|rework> --change <name> [--verdict PASS|FAIL] [--question …] [--pause-questions] [--note …] [--json]",
          );
          process.exit(1);
        }
        const changeName =
          typeof flags.change === "string" ? flags.change : (flags._[2] as string | undefined);
        if (!changeName) {
          ui.err("Usage: speclaw lawbook harness <op> --change <name>");
          process.exit(1);
        }
        const verdictRaw =
          typeof flags.verdict === "string" ? flags.verdict.toUpperCase() : undefined;
        const verdict =
          verdictRaw === "PASS" || verdictRaw === "FAIL"
            ? (verdictRaw as "PASS" | "FAIL")
            : undefined;
        const result = handleHarness({
          projectPath: cwd,
          change: changeName,
          harnessOp: op,
          verdict: verdict ?? null,
          openQuestions: list(flags.question),
          pauseForQuestions: Boolean(flags["pause-questions"]),
          note: typeof flags.note === "string" ? flags.note : undefined,
        });
        printHarnessWarnings(result);
        if (flags.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      default:
        ui.err(
          "Usage: speclaw lawbook <init|list|validate|sync|archive|level|draft|investigate|harness> [change]",
        );
        process.exit(1);
    }
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}

/** Parse a `--level` flag value into a ceremony level; throws on anything but 0–3. */
function parseLevel(raw: string | boolean | string[]): 0 | 1 | 2 | 3 {
  const n = Number(Array.isArray(raw) ? raw[raw.length - 1] : raw);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  throw new Error(`--level must be 0, 1, 2, or 3 (got "${String(raw)}")`);
}

/** Return the value or print a usage error and exit if it is missing. */
function req(value: string | undefined, usage: string): string {
  if (!value) {
    ui.err(`Usage: speclaw ${usage}`);
    process.exit(1);
  }
  return value;
}
