import fs from "node:fs";
import path from "node:path";
import { AgentDef, agentById } from "../../shared/agents.js";
import { InstallReport, sha256 } from "../../shared/install.js";
import { CheckEvent } from "./check.js";
import { LawManifest, Law, globError, hasBackend } from "./laws.js";

// The hook compiler: it turns declared laws into agent hook entries, adds the
// session-start index refresh, and merges both into an agent's settings by
// identity. Two hook shapes exist: the `speclaw_check` `mcp_tool` hook and the
// `SessionStart` `command` hook. All knowledge of the hook wire format lives
// here — nothing else in the codebase knows what a hook looks like, so a change
// in Claude Code's (young) hook surface is contained to this file.

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
    tool_input: {
      file_path: string;
      path: string;
      pattern: string;
      glob: string;
      type: string;
    };
  };
}

/**
 * The `speclaw_check` hook object, used by every law-driven event and the
 * Compass-first nudge; the `{type, server}` pair is its merge identity.
 */
export interface SpeclawHook {
  type: "mcp_tool";
  server: "speclaw";
  tool: "speclaw_check";
  timeout: number;
  input: SpeclawHookInput;
}

/**
 * The session-start `command` hook object. Only `type`, `command`, and `timeout`
 * are written; a `command` containing {@link SESSION_START_MARKER} is its merge
 * identity.
 */
export interface SpeclawCommandHook {
  type: "command";
  command: string;
  /** Seconds before Claude Code abandons the (blocking) hook. */
  timeout: number;
}

/** Every hook object speclaw writes. */
export type AnySpeclawHook = SpeclawHook | SpeclawCommandHook;

/**
 * One matcher group in an agent's settings: a matcher (a tool name, or a
 * `SessionStart` source) and its hooks.
 */
export interface HookGroup<H extends AnySpeclawHook = AnySpeclawHook> {
  matcher?: string;
  hooks: H[];
}

/**
 * Every hook event speclaw writes: the `speclaw_check` events plus
 * `SessionStart`, which never reaches `speclaw_check` (so `CheckEvent` stays
 * narrow).
 */
export type HookEvent = CheckEvent | "SessionStart";

/**
 * Substring every speclaw session-start command contains, in each of its
 * resolution branches. It is the merge identity of the `SessionStart` hook.
 */
export const SESSION_START_MARKER = "speclaw session-start";

/**
 * The marker of the unreleased `index --session-start` hook shape that
 * pre-release 2.0.7 builds wrote. Still recognized so a merge replaces such an
 * entry instead of keeping it next to the current one.
 */
const LEGACY_SESSION_START_MARKER = "speclaw index --session-start";

/**
 * The POSIX `sh` command the `SessionStart` hook runs. The `index.db` guard runs
 * in the shell, so a project without an index pays no Node start-up. It invokes
 * the top-level `session-start` command, which a speclaw older than 2.0.7
 * rejects as unknown (exit 1) before indexing, logging, or notifying, so a stale
 * binary first in the resolution order does nothing. speclaw resolves as local
 * `node_modules/.bin`, then `PATH`, then `npx --no-install` with
 * `npm_config_offline=true` and `npm_config_update_notifier=false`, so npx
 * neither installs nor contacts the registry (offline alone still lets npm's
 * own update notifier query it).
 * Output is discarded because `SessionStart` stdout enters the agent's context,
 * and `|| true` keeps the exit code 0 in every case.
 */
export const SESSION_START_COMMAND =
  'cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null && [ -f .speclaw/index.db ] && { ' +
  "if [ -x node_modules/.bin/speclaw ]; then node_modules/.bin/speclaw session-start; " +
  "elif command -v speclaw >/dev/null 2>&1; then speclaw session-start; " +
  "else npm_config_update_notifier=false npm_config_offline=true npx --no-install @esneiderbravo/speclaw session-start; fi; " +
  "} >/dev/null 2>&1 || true";

/** `SessionStart` matcher covering every session source Claude Code reports. */
const SESSION_START_MATCHER = "startup|resume|clear|compact";

/** Seconds the blocking session-start hook may run (index wait plus a real refresh). */
const SESSION_START_TIMEOUT = 30;

/** Claude Code `${path}` templates — see https://code.claude.com/docs/en/hooks */
const SPECLAW_HOOK_INPUT: SpeclawHookInput = {
  projectPath: "${cwd}",
  event: "${hook_event_name}",
  toolName: "${tool_name}",
  payload: {
    hook_event_name: "${hook_event_name}",
    tool_name: "${tool_name}",
    tool_input: {
      file_path: "${tool_input.file_path}",
      path: "${tool_input.path}",
      pattern: "${tool_input.pattern}",
      glob: "${tool_input.glob}",
      type: "${tool_input.type}",
    },
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

/**
 * Tool-name matcher for the code-reading tools the Compass-first nudge watches.
 * Installed on `PostToolUse` only: there the result is context the agent reads
 * and the event cannot gate the tool; a `PreToolUse` "allow" would auto-approve.
 */
export const NUDGE_MATCHER = "Read|Grep|Glob";

/**
 * True when a hook object is one speclaw owns (safe to replace on merge): an
 * `mcp_tool` hook on the `speclaw` server, or a `command` hook whose command
 * contains {@link SESSION_START_MARKER} (or the pre-release
 * `index --session-start` marker). A user `command` hook without the
 * marker is never speclaw's.
 *
 * @param h - A hook object read from an agent's settings (any shape).
 * @returns Whether speclaw owns the hook.
 */
export function isSpeclawHook(h: unknown): boolean {
  const o = h as { type?: unknown; server?: unknown; command?: unknown };
  if (o?.type === "mcp_tool" && o?.server === "speclaw") return true;
  return (
    o?.type === "command" &&
    typeof o?.command === "string" &&
    (o.command.includes(SESSION_START_MARKER) || o.command.includes(LEGACY_SESSION_START_MARKER))
  );
}

/**
 * speclaw's compiled groups keyed by {@link HookEvent}: the `speclaw_check`
 * events carry `mcp_tool` hooks, `SessionStart` carries the `command` hook.
 */
export type CompiledByEvent = { [E in CheckEvent]?: HookGroup<SpeclawHook>[] } & {
  SessionStart?: HookGroup<SpeclawCommandHook>[];
};

/** The result of compiling a manifest: the per-event groups plus any rejected laws. */
export interface CompiledHooks {
  byEvent: CompiledByEvent;
  /** Laws excluded from generation because a scope glob was malformed. */
  invalid: Array<{ lawId: string; pattern: string; error: string }>;
}

/**
 * Compile a law manifest into the hook groups speclaw contributes, one per event
 * the laws demand: `PreToolUse` when any `bloqueo` law exists, `PostToolUse` for
 * `feedback`, `Stop` for `gate`, and `InstructionsLoaded` whenever any law exists
 * (the context-coverage audit). Two groups are always emitted, even with no
 * laws: one `PostToolUse` group matching `Read|Grep|Glob` for the Compass-first
 * nudge, and one `SessionStart` group whose `command` hook refreshes the index
 * silently when a session starts. A law whose scope contains a malformed glob is
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
  // The Compass-first nudge entry is always present, laws or not.
  byEvent.PostToolUse = [{ matcher: NUDGE_MATCHER, hooks: [{ ...SPECLAW_HOOK }] }];
  if (hasFeedback)
    byEvent.PostToolUse.unshift({ matcher: MUTATION_MATCHER, hooks: [{ ...SPECLAW_HOOK }] });
  if (hasGate) byEvent.Stop = [{ hooks: [{ ...SPECLAW_HOOK }] }];
  if (valid.length > 0) byEvent.InstructionsLoaded = [{ hooks: [{ ...SPECLAW_HOOK }] }];
  // Covers: req~session-start-hook~1
  byEvent.SessionStart = [
    {
      matcher: SESSION_START_MATCHER,
      hooks: [{ type: "command", command: SESSION_START_COMMAND, timeout: SESSION_START_TIMEOUT }],
    },
  ];

  return { byEvent, invalid };
}

/**
 * Merge speclaw's compiled hook groups into an existing `hooks` object by
 * identity: for every event, drop the groups speclaw owns (a group whose hooks
 * are all speclaw's) and re-add the freshly compiled ones, never touching a
 * hook that is not speclaw's (see {@link isSpeclawHook}). Idempotent, and it
 * cannot delete another tool's hooks.
 *
 * @param existing - The current `hooks` object from the agent's settings (any shape).
 * @param compiled - speclaw's per-event hook groups from {@link compileHooks}.
 * @returns A new `hooks` object with speclaw's entries reconciled in.
 */
export function mergeHooks(
  existing: Record<string, unknown> | undefined,
  compiled: CompiledByEvent,
): Record<string, HookGroup[]> {
  const out: Record<string, HookGroup[]> = {};
  const events = new Set<string>([...Object.keys(existing ?? {}), ...Object.keys(compiled)]);
  for (const event of events) {
    const prior = Array.isArray(existing?.[event]) ? (existing![event] as HookGroup[]) : [];
    // Keep foreign groups: drop speclaw hooks from each group, then any group left empty.
    const kept = prior
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isSpeclawHook(h)) }))
      .filter((g) => g.hooks.length > 0);
    const mine: HookGroup[] = compiled[event as HookEvent] ?? [];
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
  compiled: CompiledByEvent,
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
