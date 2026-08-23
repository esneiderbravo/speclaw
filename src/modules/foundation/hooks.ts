import fs from "node:fs";
import path from "node:path";
import { AgentDef, agentById } from "../../shared/agents.js";
import { InstallReport, sha256 } from "../../shared/install.js";
import { CheckEvent } from "./check.js";
import { LawManifest, Law, globError, hasBackend } from "./laws.js";

// The hook compiler: it turns declared laws into agent hook entries and merges
// them into an agent's settings by identity. All knowledge of the hook wire
// format lives here — nothing else in the codebase knows what a hook looks like,
// so a change in Claude Code's (young) hook surface is contained to this file.

/**
 * Arguments Claude Code substitutes into `speclaw_check` via `${…}` from the
 * hook event JSON. Required: Claude Code does **not** auto-inject tool args for
 * `mcp_tool` hooks — omitting `input` yields MCP -32602 validation errors.
 */
export interface SpeclawHookInput {
  projectPath: string;
  event: string;
  toolName: string;
  payload: {
    hook_event_name: string;
    tool_name: string;
    tool_input: { file_path: string };
  };
}

/** The single hook object every speclaw hook is; the `{type, server}` pair is its merge identity. */
export interface SpeclawHook {
  type: "mcp_tool";
  server: "speclaw";
  tool: "speclaw_check";
  timeout: number;
  input: SpeclawHookInput;
}

/** One matcher group in an agent's settings: a tool-name matcher and its hooks. */
export interface HookGroup {
  matcher?: string;
  hooks: SpeclawHook[];
}

/** Claude Code `${path}` templates — see https://code.claude.com/docs/en/hooks */
const SPECLAW_HOOK_INPUT: SpeclawHookInput = {
  projectPath: "${cwd}",
  event: "${hook_event_name}",
  toolName: "${tool_name}",
  payload: {
    hook_event_name: "${hook_event_name}",
    tool_name: "${tool_name}",
    tool_input: { file_path: "${tool_input.file_path}" },
  },
};

/** The speclaw hook object — its `{type, server}` pair is the merge identity. */
const SPECLAW_HOOK: SpeclawHook = {
  type: "mcp_tool",
  server: "speclaw",
  tool: "speclaw_check",
  timeout: 5,
  input: SPECLAW_HOOK_INPUT,
};

/** Tool-name matcher for the file-mutating tools the `path` backend can evaluate. */
const MUTATION_MATCHER = "Write|Edit|MultiEdit|NotebookEdit";

/** True when a hook object is one speclaw owns (safe to replace on merge). */
function isSpeclawHook(h: unknown): boolean {
  const o = h as { type?: unknown; server?: unknown };
  return o?.type === "mcp_tool" && o?.server === "speclaw";
}

/** The result of compiling a manifest: the per-event groups plus any rejected laws. */
export interface CompiledHooks {
  byEvent: Partial<Record<CheckEvent, HookGroup[]>>;
  /** Laws excluded from generation because a scope glob was malformed. */
  invalid: Array<{ lawId: string; pattern: string; error: string }>;
}

/**
 * Compile a law manifest into the hook groups speclaw contributes, one per event
 * the laws demand: `PreToolUse` when any `bloqueo` law exists, `PostToolUse` for
 * `feedback`, `Stop` for `gate`, and `InstructionsLoaded` whenever any law exists
 * (the context-coverage audit). A law whose scope contains a malformed glob is
 * excluded and reported, so a bad pattern fails loudly at generation rather than
 * silently matching nothing at runtime.
 *
 * @param manifest - The project's law manifest.
 * @returns The per-event hook groups and the list of laws rejected for bad globs.
 */
export function compileHooks(manifest: LawManifest): CompiledHooks {
  const invalid: CompiledHooks["invalid"] = [];
  const valid: Law[] = [];
  for (const law of manifest.laws) {
    const bad = law.scope.map((p) => ({ p, e: globError(p) })).find((x) => x.e);
    if (bad) invalid.push({ lawId: law.id, pattern: bad.p, error: bad.e as string });
    else valid.push(law);
  }

  const byEvent: CompiledHooks["byEvent"] = {};
  const hasBloqueo = valid.some((l) => l.enforcement === "bloqueo" && hasBackend(l));
  const hasFeedback = valid.some((l) => l.enforcement === "feedback" && hasBackend(l));
  const hasGate = valid.some((l) => l.enforcement === "gate");
  if (hasBloqueo)
    byEvent.PreToolUse = [{ matcher: MUTATION_MATCHER, hooks: [{ ...SPECLAW_HOOK }] }];
  if (hasFeedback)
    byEvent.PostToolUse = [{ matcher: MUTATION_MATCHER, hooks: [{ ...SPECLAW_HOOK }] }];
  if (hasGate) byEvent.Stop = [{ hooks: [{ ...SPECLAW_HOOK }] }];
  if (valid.length > 0) byEvent.InstructionsLoaded = [{ hooks: [{ ...SPECLAW_HOOK }] }];

  return { byEvent, invalid };
}

/**
 * Merge speclaw's compiled hook groups into an existing `hooks` object by
 * identity: for every event, drop the groups speclaw owns (a group whose hooks
 * are all speclaw's) and re-add the freshly compiled ones, never touching a
 * group with a foreign `server` or `type`. Idempotent, marker-free, and it
 * cannot delete another tool's hooks.
 *
 * @param existing - The current `hooks` object from the agent's settings (any shape).
 * @param compiled - speclaw's per-event hook groups from {@link compileHooks}.
 * @returns A new `hooks` object with speclaw's entries reconciled in.
 */
export function mergeHooks(
  existing: Record<string, unknown> | undefined,
  compiled: CompiledHooks["byEvent"],
): Record<string, HookGroup[]> {
  const out: Record<string, HookGroup[]> = {};
  const events = new Set<string>([...Object.keys(existing ?? {}), ...Object.keys(compiled)]);
  for (const event of events) {
    const prior = Array.isArray(existing?.[event]) ? (existing![event] as HookGroup[]) : [];
    // Keep foreign groups: drop speclaw hooks from each group, then any group left empty.
    const kept = prior
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isSpeclawHook(h)) }))
      .filter((g) => g.hooks.length > 0);
    const mine = compiled[event as CheckEvent] ?? [];
    const merged = [...kept, ...mine];
    if (merged.length > 0) out[event] = merged;
  }
  return out;
}

/**
 * Install (or refresh) speclaw's hooks into one agent's settings file, merging by
 * identity and honoring the managed-file baseline: a settings file that diverged
 * from what speclaw last wrote is backed up to `<file>.bak` first when `backup`
 * is set, and always reported. The baseline sha of the written file is recorded.
 *
 * @param projectPath - Project root.
 * @param agent - The agent whose `hooks` capability names the settings file and key.
 * @param compiled - speclaw's compiled hook groups.
 * @param report - Install report mutated in place.
 * @param opts - Managed-file behavior: recorded baselines, backup, and a record sink.
 */
function installForAgent(
  projectPath: string,
  agent: AgentDef,
  compiled: CompiledHooks["byEvent"],
  report: InstallReport,
  opts: { baselines?: Record<string, string>; backup?: boolean; record?: Record<string, string> },
): void {
  if (!agent.hooks) return;
  const settingsPath = path.join(projectPath, agent.hooks.file);
  const rel = path.relative(projectPath, settingsPath);

  let settings: Record<string, unknown> = {};
  let current: string | null = null;
  if (fs.existsSync(settingsPath)) {
    current = fs.readFileSync(settingsPath, "utf8");
    try {
      settings = JSON.parse(current);
    } catch {
      // A settings file we cannot parse is the user's — never clobber it silently.
      report.skipped.push(`${settingsPath} (unparseable — left untouched)`);
      return;
    }
  }

  settings[agent.hooks.key] = mergeHooks(
    settings[agent.hooks.key] as Record<string, unknown> | undefined,
    compiled,
  );
  const content = JSON.stringify(settings, null, 2) + "\n";
  const newSha = sha256(content);

  if (current !== null) {
    if (sha256(current) === newSha) {
      if (opts.record) opts.record[rel] = newSha;
      return; // already current — no drift
    }
    const baseline = opts.baselines?.[rel];
    if (!baseline || sha256(current) !== baseline) {
      if (opts.backup) {
        fs.copyFileSync(settingsPath, settingsPath + ".bak");
        report.backedUp.push(settingsPath);
      }
      report.refreshedDiverged.push(settingsPath);
    }
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, content);
  report.written.push(`${settingsPath} (speclaw hooks)`);
  if (opts.record) opts.record[rel] = newSha;
}

/** The outcome of an {@link installHooks} run, for surfacing in init/doctor. */
export interface HookInstallResult {
  /** Ids of agents that received hooks (declare a `hooks` capability). */
  hooked: string[];
  /** Ids of selected agents with no hook support (blocking laws apply only via verify). */
  unhooked: string[];
  /** Laws excluded because a scope glob was malformed. */
  invalid: CompiledHooks["invalid"];
}

/**
 * Compile the manifest and install speclaw's hooks into every hook-capable agent
 * among those selected, skipping agents without a `hooks` capability (Cursor,
 * Codex, Windsurf) by construction. A malformed glob excludes only that law and
 * is surfaced in the result.
 *
 * @param projectPath - Project root.
 * @param agentIds - Ids of the agents configured for this project.
 * @param manifest - The project's law manifest.
 * @param report - Install report mutated in place.
 * @param opts - Managed-file behavior: recorded baselines, backup, and a record sink.
 * @returns Which agents were hooked, which were skipped, and any rejected laws.
 */
export function installHooks(
  projectPath: string,
  agentIds: string[],
  manifest: LawManifest,
  report: InstallReport,
  opts: { baselines?: Record<string, string>; backup?: boolean; record?: Record<string, string> },
): HookInstallResult {
  const { byEvent, invalid } = compileHooks(manifest);
  const hooked: string[] = [];
  const unhooked: string[] = [];
  for (const id of agentIds) {
    const agent = agentById(id);
    if (!agent) continue;
    if (!agent.hooks) {
      unhooked.push(id);
      continue;
    }
    installForAgent(projectPath, agent, byEvent, report, opts);
    hooked.push(id);
  }
  return { hooked, unhooked, invalid };
}
