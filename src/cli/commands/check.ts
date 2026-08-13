import { Flags } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";
import { checkAction, CheckEvent } from "../../modules/foundation/check.js";
import { hasBackend, readLawManifest } from "../../modules/foundation/laws.js";

/** Read all of stdin as UTF-8 text (used for `--hook-payload -`). */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * `speclaw check` — the CLI twin of the `speclaw_check` MCP tool, and the
 * command-hook fallback for agents driven purely by the CLI.
 *
 * - `--hook-payload -` reads a hook event JSON from stdin, evaluates it, prints
 *   the `hookSpecificOutput` contract, and exits 2 on `deny` (the documented
 *   command-hook block signal).
 * - `--dry-run [--path P] [--event E]` previews the verdict for a synthetic
 *   action against path `P`, without blocking anything (always exits 0).
 * - with no flags, prints a summary of the project's declared laws.
 *
 * @param flags - Parsed CLI flags.
 */
export async function runCheck(flags: Flags): Promise<void> {
  const cwd = process.cwd();

  if (flags["hook-payload"]) {
    const raw = await readStdin();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Fail open: an unreadable payload must never block the agent.
      console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }));
      return;
    }
    const event = (payload.hook_event_name ?? payload.event ?? "PreToolUse") as CheckEvent;
    const toolName = (payload.tool_name ?? payload.toolName) as string | undefined;
    const result = checkAction({ projectPath: cwd, event, toolName, payload });
    const decision = result.verdict === "deny" ? "deny" : "allow";
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          permissionDecision: decision,
          permissionDecisionReason: result.reason ?? "",
        },
      }),
    );
    if (result.verdict === "deny") process.exit(2);
    return;
  }

  if (flags["dry-run"]) {
    const target = typeof flags.path === "string" ? flags.path : "";
    const event = (typeof flags.event === "string" ? flags.event : "PreToolUse") as CheckEvent;
    if (!target) {
      ui.err(`Pass ${ui.code("--path <file>")} to preview what a law would do to that path.`);
      process.exit(1);
    }
    const result = checkAction({
      projectPath: cwd,
      event,
      payload: { tool_input: { file_path: target } },
    });
    ui.heading(`speclaw check --dry-run (${event})`);
    ui.info(`target: ${c.cream(target)}`);
    if (result.diagnostic) ui.warn(result.diagnostic);
    if (result.evaluated.length === 0) {
      ui.ok("No law applies to this path.");
    } else {
      for (const e of result.evaluated) {
        // The message already opens with the law id (see check.ts `cite`).
        const line = e.message ?? e.lawId;
        if (e.passed) ui.info(line);
        else ui.warn(line);
      }
    }
    ui.plain();
    const verb = result.verdict === "deny" ? c.red("would BLOCK") : c.green("would allow");
    ui.plain(`  verdict: ${verb} · evaluated in ${result.elapsedMs.toFixed(1)} ms`);
    return;
  }

  // Default: summarize the declared laws.
  const manifest = readLawManifest(cwd);
  ui.heading("speclaw check");
  if (!manifest) {
    ui.warn("No law manifest — run `speclaw init` to seed .speclaw/laws-manifest.json.");
    return;
  }
  ui.info(`${manifest.laws.length} law(s) declared:`);
  for (const law of manifest.laws) {
    const backend = hasBackend(law)
      ? law.verification.kind
      : `${law.verification.kind} (no backend yet)`;
    ui.plain(
      `  · ${c.cream(law.id)} — ${law.enforcement} · ${backend} · [${law.scope.join(", ")}]`,
    );
  }
}
