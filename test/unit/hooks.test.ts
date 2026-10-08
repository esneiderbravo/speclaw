import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { tmpRepo, read, has, write } from "../helpers/env.js";
import { emptyReport } from "../../src/shared/install.js";
import {
  compileHooks,
  mergeHooks,
  installHooks,
  isSpeclawHook,
  SESSION_START_COMMAND,
  SESSION_START_MARKER,
  REINDEX_FILE_COMMAND,
  REINDEX_FILE_MARKER,
  speclawCommand,
  type HookGroup,
} from "../../src/modules/foundation/hooks.js";
import type { Law, LawManifest } from "../../src/modules/foundation/laws.js";
import type { SpeclawHook } from "../../src/modules/foundation/hooks.js";

const lawOf = (over: Partial<Law> = {}): Law => ({
  id: "law~x~1",
  title: "X",
  severity: "warn",
  scope: ["src/**"],
  prose: "do x",
  verification: { kind: "path" },
  enforcement: "feedback",
  source: { file: "LAWS.md" },
  ...over,
});

const manifest = (laws: Law[]): LawManifest => ({ version: 1, laws });

/** The `server` of a merged hook, which may be a `command` hook without one. */
const serverOf = (h: unknown): unknown => (h as { server?: unknown }).server;

test("compileHooks maps each enforcement type to its event", () => {
  const { byEvent } = compileHooks(
    manifest([
      lawOf({ id: "law~b~1", enforcement: "bloqueo", scope: ["**/.env"] }),
      lawOf({ id: "law~f~1", enforcement: "feedback" }),
      lawOf({ id: "law~g~1", enforcement: "gate" }),
    ]),
  );
  assert.ok(byEvent.PreToolUse); // bloqueo
  assert.ok(byEvent.PostToolUse); // feedback
  assert.ok(byEvent.Stop); // gate
  assert.ok(byEvent.InstructionsLoaded); // always, for the audit
  assert.equal(byEvent.PreToolUse![0]!.hooks[0]!.server, "speclaw");
  assert.equal(byEvent.PreToolUse![0]!.hooks[0]!.input.projectPath, "${cwd}");
  assert.equal(byEvent.PreToolUse![0]!.hooks[0]!.input.event, "${hook_event_name}");
  const gate = byEvent.Stop![0]!.hooks[0]! as SpeclawHook;
  assert.equal(gate.input.payload.tool_input.file_path, "${tool_input.file_path}");
});

test("compileHooks excludes a law with a malformed glob and reports it", () => {
  const { byEvent, invalid } = compileHooks(
    manifest([lawOf({ id: "law~bad~1", enforcement: "bloqueo", scope: ["src/[oops"] })]),
  );
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0]?.lawId, "law~bad~1");
  assert.ok(!byEvent.PreToolUse); // the only bloqueo law was rejected
});

test("mergeHooks preserves foreign entries and is idempotent", () => {
  const { byEvent } = compileHooks(
    manifest([lawOf({ enforcement: "bloqueo", scope: ["**/.env"] })]),
  );
  const existing = {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }],
  };
  const once = mergeHooks(existing, byEvent);
  // the foreign command hook survives, speclaw's is appended
  assert.ok(
    once.PreToolUse!.some((g) => g.hooks.some((h) => (h as { type: string }).type === "command")),
  );
  assert.ok(once.PreToolUse!.some((g) => g.hooks.some((h) => serverOf(h) === "speclaw")));
  // merging again over the result adds no duplicate speclaw group
  const twice = mergeHooks(once as Record<string, unknown>, byEvent);
  const speclawGroups = twice.PreToolUse!.filter((g) =>
    g.hooks.some((h) => serverOf(h) === "speclaw"),
  );
  assert.equal(speclawGroups.length, 1);
});

test("mergeHooks drops a stale speclaw entry when the event is no longer generated", () => {
  const existing = {
    PreToolUse: [{ matcher: "Write", hooks: [{ type: "mcp_tool", server: "speclaw" }] }],
  };
  const merged = mergeHooks(existing, {}); // nothing compiled now
  assert.ok(!merged.PreToolUse); // stale speclaw group removed, empty array pruned
});

test("installHooks writes settings for a hook-capable agent and skips others", (t) => {
  const root = tmpRepo(t);
  const report = emptyReport();
  const res = installHooks(
    root,
    ["claude", "cursor"],
    manifest([lawOf({ enforcement: "bloqueo", scope: ["**/.env"] })]),
    report,
    {},
  );
  assert.deepEqual(res.hooked, ["claude"]);
  assert.deepEqual(res.unhooked, ["cursor"]);
  assert.ok(has(root, ".claude/settings.json"));
  const settings = JSON.parse(read(root, ".claude/settings.json"));
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].server, "speclaw");
  assert.ok(!has(root, ".cursor/settings.json"));
});

test("installHooks upgrades legacy mcp_tool hooks that lack input", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    ".claude/settings.json",
    JSON.stringify(
      {
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: "mcp_tool",
                  server: "speclaw",
                  tool: "speclaw_check",
                  timeout: 5,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo keep-me" }],
            },
          ],
        },
      },
      null,
      2,
    ) + "\n",
  );
  const report = emptyReport();
  installHooks(
    root,
    ["claude"],
    manifest([
      lawOf({ id: "law~b~1", enforcement: "bloqueo", scope: ["**/.env"] }),
      lawOf({ id: "law~g~1", enforcement: "gate" }),
    ]),
    report,
    {},
  );
  const settings = JSON.parse(read(root, ".claude/settings.json")) as {
    hooks: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>>;
  };
  const stopHook = settings.hooks.Stop![0]!.hooks[0]!;
  assert.equal(stopHook.server, "speclaw");
  assert.ok(stopHook.input);
  assert.equal((stopHook.input as { projectPath: string }).projectPath, "${cwd}");
  assert.ok(
    settings.hooks.PreToolUse!.some((g) =>
      g.hooks.some((h) => h.type === "command" && h.command === "echo keep-me"),
    ),
  );
});

test("installHooks never clobbers an unparseable settings file", (t) => {
  const root = tmpRepo(t);
  write(root, ".claude/settings.json", "{ not json");
  const report = emptyReport();
  installHooks(root, ["claude"], manifest([lawOf()]), report, {});
  assert.equal(read(root, ".claude/settings.json"), "{ not json");
  assert.ok(report.skipped.some((s) => s.includes("settings.json")));
});

// Covers: req~compass-nudge~1
test("compileHooks always emits the Read|Grep|Glob|Bash PostToolUse nudge entry, even with zero laws", () => {
  const { byEvent } = compileHooks(manifest([]));
  assert.deepEqual(Object.keys(byEvent), ["PostToolUse", "Stop", "SessionStart"]);
  const ship = byEvent.Stop![0]!.hooks[0]!;
  assert.equal(ship.type, "command");
  assert.match((ship as { command: string }).command, /speclaw ship-on-stop/);
  assert.ok(isSpeclawHook(ship));
  const group = byEvent.PostToolUse![0]!;
  assert.equal(group.matcher, "Read|Grep|Glob|Bash");
  const hook = group.hooks[0]!;
  assert.equal(hook.type, "mcp_tool");
  assert.equal(hook.server, "speclaw");
  assert.equal(hook.tool, "speclaw_check");
  assert.deepEqual(hook.input.payload.tool_input, {
    file_path: "${tool_input.file_path}",
    path: "${tool_input.path}",
    pattern: "${tool_input.pattern}",
    glob: "${tool_input.glob}",
    type: "${tool_input.type}",
    command: "${tool_input.command}",
  });
});

test("compileHooks never puts the nudge matcher on PreToolUse", () => {
  const { byEvent } = compileHooks(
    manifest([
      lawOf({ id: "law~b~1", enforcement: "bloqueo", scope: ["**/.env"] }),
      lawOf({ id: "law~f~1", enforcement: "feedback" }),
    ]),
  );
  assert.ok(byEvent.PreToolUse!.every((g) => !/Read|Grep|Glob/.test(g.matcher ?? "")));
  // feedback laws keep their mutation group alongside the nudge group; the
  // documentation-hint group follows, and the edit reindex group is last
  assert.deepEqual(
    byEvent.PostToolUse!.map((g) => g.matcher),
    [
      "Write|Edit|MultiEdit|NotebookEdit",
      "Read|Grep|Glob|Bash",
      "Write|Edit|MultiEdit|NotebookEdit",
      "Write|Edit|MultiEdit|NotebookEdit",
    ],
  );
  const doc = byEvent.PostToolUse![2]!.hooks[0] as {
    input?: { payload?: { speclaw_hint?: string } };
  };
  assert.equal(doc.input?.payload?.speclaw_hint, "doc");
  assert.equal(byEvent.PostToolUse![0]!.hooks[0]!.type, "mcp_tool");
});

test("installHooks with zero laws installs the nudge, keeps foreign entries, and reruns without drift", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    ".claude/settings.json",
    JSON.stringify(
      {
        hooks: {
          PostToolUse: [{ matcher: "Read", hooks: [{ type: "command", command: "echo mine" }] }],
        },
      },
      null,
      2,
    ) + "\n",
  );
  const record: Record<string, string> = {};
  installHooks(root, ["claude"], manifest([]), emptyReport(), { record });
  const first = read(root, ".claude/settings.json");
  const settings = JSON.parse(first) as {
    hooks: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>>;
  };
  const post = settings.hooks.PostToolUse!;
  assert.ok(post.some((g) => g.hooks.some((h) => h.command === "echo mine")));
  assert.ok(
    post.some(
      (g) => g.matcher === "Read|Grep|Glob|Bash" && g.hooks.some((h) => h.server === "speclaw"),
    ),
  );
  assert.ok(!settings.hooks.PreToolUse);

  const report = emptyReport();
  installHooks(root, ["claude"], manifest([]), report, { baselines: { ...record } });
  assert.equal(read(root, ".claude/settings.json"), first);
  assert.deepEqual(report.written, []);
  assert.deepEqual(report.refreshedDiverged, []);
});

// Covers: req~session-start-hook~1
test("compileHooks always emits the SessionStart index-refresh command, even with zero laws", () => {
  const { byEvent } = compileHooks(manifest([]));
  const groups = byEvent.SessionStart!;
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.matcher, "startup|resume|clear|compact");
  assert.equal(groups[0]!.hooks.length, 1);
  const hook = groups[0]!.hooks[0]!;
  // only the three keys Claude Code's command hook schema defines
  assert.deepEqual(Object.keys(hook).sort(), ["command", "timeout", "type"]);
  assert.equal(hook.type, "command");
  assert.equal(hook.timeout, 30);
  assert.equal(hook.command, SESSION_START_COMMAND);
  assert.ok(hook.command.includes(SESSION_START_MARKER));
  assert.ok(
    hook.command.includes("npm_config_offline=true npx --no-install @esneiderbravo/speclaw"),
  );
  // a top-level command, never an `index` flag an older speclaw would ignore
  assert.ok(!hook.command.includes("speclaw index"));
  assert.ok(hook.command.includes("[ -f .speclaw/index.db ]"));
  assert.ok(hook.command.endsWith("|| true"));
  // every resolution branch carries the marker, so identity holds whichever runs
  assert.equal(hook.command.split(SESSION_START_MARKER).length - 1, 3);
});

test("isSpeclawHook recognizes the session-start command and rejects user commands", () => {
  assert.equal(isSpeclawHook({ type: "command", command: SESSION_START_COMMAND }), true);
  assert.equal(
    isSpeclawHook({ type: "command", command: "npx speclaw session-start || true" }),
    true,
  );
  assert.equal(isSpeclawHook({ type: "command", command: "echo hello" }), false);
  assert.equal(isSpeclawHook({ type: "command", command: "speclaw index" }), false);
  assert.equal(isSpeclawHook({ type: "command" }), false);
  assert.equal(isSpeclawHook({ type: "mcp_tool", server: "speclaw" }), true);
  assert.equal(isSpeclawHook({ type: "mcp_tool", server: "other" }), false);
  assert.equal(isSpeclawHook(null), false);
});

test("mergeHooks keeps exactly one speclaw SessionStart entry and preserves a user one", () => {
  const { byEvent } = compileHooks(manifest([]));
  const existing = {
    SessionStart: [
      { matcher: "startup", hooks: [{ type: "command", command: "echo user-start" }] },
      // a stale speclaw entry with an older command shape is replaced, not duplicated
      { hooks: [{ type: "command", command: "speclaw session-start", timeout: 10 }] },
      // the pre-release `index --session-start` shape is speclaw's too
      { hooks: [{ type: "command", command: "speclaw index --session-start", timeout: 30 }] },
    ],
  };
  const once = mergeHooks(existing, byEvent);
  const twice = mergeHooks(once as Record<string, unknown>, byEvent);
  assert.deepEqual(twice, once);
  const groups = twice.SessionStart! as HookGroup[];
  const mine = groups.filter((g) => g.hooks.some((h) => isSpeclawHook(h)));
  assert.equal(mine.length, 1);
  assert.equal(mine[0]!.hooks.length, 1);
  assert.deepEqual(mine[0]!.hooks[0], {
    type: "command",
    command: SESSION_START_COMMAND,
    timeout: 30,
  });
  assert.ok(
    groups.some(
      (g) =>
        g.matcher === "startup" &&
        g.hooks.some((h) => (h as { command?: string }).command === "echo user-start"),
    ),
  );
});

test("installHooks writes the SessionStart entry for Claude only and reruns without drift", (t) => {
  const root = tmpRepo(t);
  const record: Record<string, string> = {};
  const res = installHooks(root, ["claude", "cursor", "codex"], manifest([]), emptyReport(), {
    record,
  });
  assert.deepEqual(res.hooked, ["claude"]);
  const first = read(root, ".claude/settings.json");
  const settings = JSON.parse(first) as { hooks: Record<string, HookGroup[]> };
  assert.equal(settings.hooks.SessionStart!.length, 1);
  assert.ok(!has(root, ".cursor/settings.json"));
  assert.ok(!has(root, ".codex/settings.json"));

  const report = emptyReport();
  installHooks(root, ["claude"], manifest([]), report, { baselines: { ...record } });
  assert.equal(read(root, ".claude/settings.json"), first);
  assert.deepEqual(report.written, []);
  assert.deepEqual(report.refreshedDiverged, []);
});

// The hook command is POSIX sh; these run it for real in temp dirs (via /bin/sh,
// so a test may narrow PATH to its stubs). The env pins
// CLAUDE_PROJECT_DIR to the temp dir: inherited from a live Claude Code session
// it would point the command at the real repository. The npm settings the npx
// branch sets are blanked so only the command itself can set them (a
// developer's environment under `npm test` must not make the assertion pass).
const runHookCommand = (cwd: string, env: Record<string, string> = {}) =>
  spawnSync("/bin/sh", ["-c", SESSION_START_COMMAND], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_offline: "",
      npm_config_update_notifier: "",
      CLAUDE_PROJECT_DIR: cwd,
      ...env,
    },
  });

/** Write an executable `sh` stub at `<root>/<rel>`. */
const stub = (root: string, rel: string, body: string): void => {
  const abs = write(root, rel, `#!/bin/sh\n${body}\n`);
  chmodSync(abs, 0o755);
};

const posix = process.platform !== "win32";

test("the session-start command does nothing without an index", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  // a local binary that would leave evidence if it were (wrongly) invoked
  stub(root, "node_modules/.bin/speclaw", `echo "$@" > "${path.join(root, "called")}"`);
  const res = runHookCommand(root);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.ok(!existsSync(path.join(root, ".speclaw/index.db")));
  assert.ok(!existsSync(path.join(root, "called")));
});

test("the session-start command prefers the local binary", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  const local = path.join(root, "local-argv");
  const onPath = path.join(root, "path-argv");
  stub(root, "node_modules/.bin/speclaw", `echo "$@" > "${local}"; echo noisy; echo err >&2`);
  stub(root, "bin/speclaw", `echo "$@" > "${onPath}"`);
  const res = runHookCommand(root, { PATH: `${path.join(root, "bin")}:${process.env.PATH}` });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.equal(readFileSync(local, "utf8").trim(), "session-start");
  assert.ok(!existsSync(onPath), "speclaw on PATH must not run when a local binary exists");
});

test("the session-start command falls back to speclaw on PATH", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  const onPath = path.join(root, "path-argv");
  stub(root, "bin/speclaw", `echo "$@" > "${onPath}"`);
  const res = runHookCommand(root, { PATH: `${path.join(root, "bin")}:${process.env.PATH}` });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(readFileSync(onPath, "utf8").trim(), "session-start");
});

test("an older speclaw on PATH rejects the command and touches nothing", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  const calls = path.join(root, "calls");
  const indexed = path.join(root, "indexed");
  // mimics a pre-2.0.7 CLI: `index` would index (and log a Compass call); any
  // unknown command prints usage and exits 1 before doing anything
  stub(
    root,
    "bin/speclaw",
    [
      `echo "$@" >> "${calls}"`,
      `if [ "$1" = index ]; then touch "${indexed}"; exit 0; fi`,
      'echo "Unknown command: $1" >&2; echo usage; exit 1',
    ].join("\n"),
  );
  const before = readdirSync(path.join(root, ".speclaw")).sort();
  const res = runHookCommand(root, { PATH: `${path.join(root, "bin")}:${process.env.PATH}` });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.equal(readFileSync(calls, "utf8").trim(), "session-start");
  assert.ok(!existsSync(indexed), "an older speclaw must never be asked to index");
  assert.deepEqual(readdirSync(path.join(root, ".speclaw")).sort(), before);
  assert.equal(readFileSync(path.join(root, ".speclaw/index.db"), "utf8"), "");
});

test("the npx fallback runs offline and never installs", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  const argv = path.join(root, "npx-argv");
  const env = path.join(root, "npx-env");
  // PATH holds only this stub: no local binary, no speclaw on PATH, so the
  // command must reach the npx branch
  stub(
    root,
    "npxbin/npx",
    `echo "$@" > "${argv}"; echo "$npm_config_offline $npm_config_update_notifier" > "${env}"`,
  );
  const res = runHookCommand(root, { PATH: path.join(root, "npxbin") });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.equal(
    readFileSync(argv, "utf8").trim(),
    "--no-install @esneiderbravo/speclaw session-start",
  );
  assert.equal(readFileSync(env, "utf8").trim(), "true false");
});

test("a failing refresh never fails the session", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  stub(root, "node_modules/.bin/speclaw", "echo boom >&2; exit 1");
  const res = runHookCommand(root);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
});

test(
  "the session-start command resolves a project path that contains a space",
  { skip: !posix },
  (t) => {
    const root = tmpRepo(t);
    const project = path.join(root, "my project");
    write(project, ".speclaw/index.db", "");
    const argv = path.join(root, "argv");
    stub(project, "node_modules/.bin/speclaw", `echo "$@" > "${argv}"; echo noisy`);
    // run from elsewhere so only CLAUDE_PROJECT_DIR can lead to the project
    const res = spawnSync("/bin/sh", ["-c", SESSION_START_COMMAND], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "");
    assert.equal(res.stderr, "");
    assert.equal(readFileSync(argv, "utf8").trim(), "session-start");
  },
);

test(
  "a nonexistent CLAUDE_PROJECT_DIR exits 0 silently and runs nothing",
  { skip: !posix },
  (t) => {
    const root = tmpRepo(t);
    // the cwd has an index and a local binary: falling back to it would be wrong
    write(root, ".speclaw/index.db", "");
    const called = path.join(root, "called");
    stub(root, "node_modules/.bin/speclaw", `echo "$@" > "${called}"`);
    const res = runHookCommand(root, { CLAUDE_PROJECT_DIR: path.join(root, "does-not-exist") });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, "");
    assert.equal(res.stderr, "");
    assert.ok(!existsSync(called), "no speclaw may run when the project dir is missing");
    assert.ok(!existsSync(path.join(root, "does-not-exist")));
  },
);

const PAYLOAD = JSON.stringify({
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path: "/tmp/x/src/a.ts", old_string: "a", new_string: "b" },
  cwd: "/tmp/x",
});

/** Run the edit reindex hook command through `sh -c` with `PAYLOAD` on stdin. */
const runReindexCommand = (cwd: string, env: Record<string, string> = {}) =>
  spawnSync("/bin/sh", ["-c", REINDEX_FILE_COMMAND], {
    cwd,
    input: PAYLOAD,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_offline: "",
      npm_config_update_notifier: "",
      CLAUDE_PROJECT_DIR: cwd,
      ...env,
    },
  });

/** The single speclaw reindex group of a compiled or merged `PostToolUse` list. */
const reindexGroups = (groups: HookGroup[] | undefined): HookGroup[] =>
  (groups ?? []).filter((g) =>
    g.hooks.some((h) =>
      String((h as { command?: unknown }).command ?? "").includes(REINDEX_FILE_MARKER),
    ),
  );

// Covers: req~edit-reindex-hook~1
test("SESSION_START_COMMAND is byte-identical to the 2.0.7 string", () => {
  assert.equal(
    SESSION_START_COMMAND,
    'cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null && [ -f .speclaw/index.db ] && { ' +
      "if [ -x node_modules/.bin/speclaw ]; then node_modules/.bin/speclaw session-start; " +
      "elif command -v speclaw >/dev/null 2>&1; then speclaw session-start; " +
      "else npm_config_update_notifier=false npm_config_offline=true npx --no-install @esneiderbravo/speclaw session-start; fi; " +
      "} >/dev/null 2>&1 || true",
  );
  // the reindex command differs only in the subcommand
  assert.equal(REINDEX_FILE_COMMAND, speclawCommand("reindex-file"));
  assert.equal(
    SESSION_START_COMMAND.replaceAll("session-start", "reindex-file"),
    REINDEX_FILE_COMMAND,
  );
});

// Covers: req~edit-reindex-hook~1
test("compileHooks always emits a separate edit reindex command group, even with zero laws", () => {
  const { byEvent } = compileHooks(manifest([]));
  const groups = reindexGroups(byEvent.PostToolUse as HookGroup[]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.matcher, "Write|Edit|MultiEdit|NotebookEdit");
  assert.equal(groups[0]!.hooks.length, 1);
  const hook = groups[0]!.hooks[0] as { type: string; command: string; timeout: number };
  // only the keys Claude Code's command hook schema defines: no `async`
  assert.deepEqual(Object.keys(hook).sort(), ["command", "timeout", "type"]);
  assert.equal(hook.type, "command");
  assert.equal(hook.timeout, 10);
  assert.equal(hook.command, REINDEX_FILE_COMMAND);
  assert.ok(
    hook.command.includes("npm_config_offline=true npx --no-install @esneiderbravo/speclaw"),
  );
  // never an index or session-start subcommand an older speclaw would run
  assert.ok(!hook.command.includes("speclaw index"));
  assert.ok(!hook.command.includes("session-start"));
  assert.equal(hook.command.split(REINDEX_FILE_MARKER).length - 1, 3);
  assert.equal(isSpeclawHook(hook), true);
});

// Covers: req~edit-reindex-hook~1
test("the reindex group never folds into the feedback mcp_tool group", () => {
  const { byEvent } = compileHooks(manifest([lawOf({ id: "law~f~1", enforcement: "feedback" })]));
  const post = byEvent.PostToolUse as HookGroup[];
  const feedback = post.filter((g) =>
    g.hooks.some((h) => (h as { type?: string }).type === "mcp_tool"),
  );
  assert.ok(feedback.length >= 1);
  for (const g of feedback) {
    assert.ok(g.hooks.every((h) => (h as { type?: string }).type === "mcp_tool"));
  }
  assert.equal(reindexGroups(post).length, 1);
  assert.equal(reindexGroups(post)[0]!.hooks.length, 1);
});

// Covers: req~edit-reindex-hook~1
test("mergeHooks keeps exactly one reindex group and preserves a user PostToolUse command", () => {
  const { byEvent } = compileHooks(manifest([]));
  const existing = {
    PostToolUse: [
      { matcher: "Write|Edit", hooks: [{ type: "command", command: "prettier --write" }] },
      // a stale speclaw reindex entry with another shape is replaced, not duplicated
      {
        matcher: "Edit",
        hooks: [{ type: "command", command: "speclaw reindex-file", timeout: 5 }],
      },
    ],
  };
  const once = mergeHooks(existing, byEvent);
  const twice = mergeHooks(once as Record<string, unknown>, byEvent);
  assert.deepEqual(twice, once);
  const post = twice.PostToolUse as HookGroup[];
  assert.equal(reindexGroups(post).length, 1);
  assert.deepEqual(reindexGroups(post)[0]!.hooks[0], {
    type: "command",
    command: REINDEX_FILE_COMMAND,
    timeout: 10,
  });
  assert.ok(
    post.some(
      (g) =>
        g.matcher === "Write|Edit" &&
        g.hooks.length === 1 &&
        (g.hooks[0] as { command?: string }).command === "prettier --write",
    ),
  );
  assert.equal(isSpeclawHook({ type: "command", command: "prettier --write" }), false);
});

// Covers: req~edit-reindex-hook~1
test("installHooks writes the reindex group for Claude only and reruns without drift", (t) => {
  const root = tmpRepo(t);
  const record: Record<string, string> = {};
  installHooks(root, ["claude", "cursor"], manifest([]), emptyReport(), { record });
  const first = read(root, ".claude/settings.json");
  const settings = JSON.parse(first) as { hooks: Record<string, HookGroup[]> };
  assert.equal(reindexGroups(settings.hooks.PostToolUse).length, 1);
  assert.ok(!has(root, ".cursor/settings.json"));
  const report = emptyReport();
  installHooks(root, ["claude"], manifest([]), report, { baselines: { ...record } });
  assert.equal(read(root, ".claude/settings.json"), first);
  assert.deepEqual(report.written, []);
});

// Covers: req~edit-reindex-hook~1
test("the reindex command does nothing without an index", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  stub(root, "node_modules/.bin/speclaw", `echo "$@" > "${path.join(root, "called")}"`);
  const res = runReindexCommand(root);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.ok(!existsSync(path.join(root, ".speclaw/index.db")));
  assert.ok(!existsSync(path.join(root, "called")));
});

// Covers: req~edit-reindex-hook~1
test("the local binary receives reindex-file and the hook payload bytes", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  const argv = path.join(root, "argv");
  const stdin = path.join(root, "stdin");
  stub(
    root,
    "node_modules/.bin/speclaw",
    `echo "$@" > "${argv}"; cat > "${stdin}"; echo noisy; echo err >&2`,
  );
  const res = runReindexCommand(root);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.equal(readFileSync(argv, "utf8").trim(), "reindex-file");
  assert.equal(readFileSync(stdin, "utf8"), PAYLOAD);
});

// Covers: req~edit-reindex-hook~1
test("an older speclaw on PATH rejects reindex-file and touches nothing", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  const calls = path.join(root, "calls");
  const indexed = path.join(root, "indexed");
  stub(
    root,
    "bin/speclaw",
    [
      `echo "$@" >> "${calls}"`,
      `if [ "$1" = index ] || [ "$1" = session-start ]; then touch "${indexed}"; exit 0; fi`,
      'echo "Unknown command: $1" >&2; echo usage; exit 1',
    ].join("\n"),
  );
  const before = readdirSync(path.join(root, ".speclaw")).sort();
  const res = runReindexCommand(root, { PATH: `${path.join(root, "bin")}:${process.env.PATH}` });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.equal(readFileSync(calls, "utf8").trim(), "reindex-file");
  assert.ok(!existsSync(indexed), "an older speclaw must never be asked to index");
  assert.deepEqual(readdirSync(path.join(root, ".speclaw")).sort(), before);
  assert.equal(readFileSync(path.join(root, ".speclaw/index.db"), "utf8"), "");
});

// Covers: req~edit-reindex-hook~1
test("the reindex npx fallback runs offline and never installs", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  const argv = path.join(root, "npx-argv");
  const env = path.join(root, "npx-env");
  stub(
    root,
    "npxbin/npx",
    `echo "$@" > "${argv}"; echo "$npm_config_offline $npm_config_update_notifier" > "${env}"`,
  );
  const res = runReindexCommand(root, { PATH: path.join(root, "npxbin") });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
  assert.equal(
    readFileSync(argv, "utf8").trim(),
    "--no-install @esneiderbravo/speclaw reindex-file",
  );
  assert.equal(readFileSync(env, "utf8").trim(), "true false");
});

// Covers: req~edit-reindex-hook~1
test("a failing reindex never fails the edit", { skip: !posix }, (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/index.db", "");
  stub(root, "node_modules/.bin/speclaw", "cat >/dev/null; echo boom >&2; exit 1");
  const res = runReindexCommand(root);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
});
