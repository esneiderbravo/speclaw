import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, read, has, write } from "../helpers/env.js";
import { emptyReport } from "../../src/shared/install.js";
import { compileHooks, mergeHooks, installHooks } from "../../src/modules/foundation/hooks.js";
import type { Law, LawManifest } from "../../src/modules/foundation/laws.js";

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
  assert.equal(
    byEvent.Stop![0]!.hooks[0]!.input.payload.tool_input.file_path,
    "${tool_input.file_path}",
  );
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
  assert.ok(once.PreToolUse!.some((g) => g.hooks.some((h) => h.server === "speclaw")));
  // merging again over the result adds no duplicate speclaw group
  const twice = mergeHooks(once as Record<string, unknown>, byEvent);
  const speclawGroups = twice.PreToolUse!.filter((g) =>
    g.hooks.some((h) => h.server === "speclaw"),
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
test("compileHooks always emits the Read|Grep|Glob PostToolUse nudge entry, even with zero laws", () => {
  const { byEvent } = compileHooks(manifest([]));
  assert.deepEqual(Object.keys(byEvent), ["PostToolUse"]);
  const group = byEvent.PostToolUse![0]!;
  assert.equal(group.matcher, "Read|Grep|Glob");
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
  // feedback laws keep their mutation group alongside the nudge group
  assert.deepEqual(
    byEvent.PostToolUse!.map((g) => g.matcher),
    ["Write|Edit|MultiEdit|NotebookEdit", "Read|Grep|Glob"],
  );
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
    post.some((g) => g.matcher === "Read|Grep|Glob" && g.hooks.some((h) => h.server === "speclaw")),
  );
  assert.ok(!settings.hooks.PreToolUse);

  const report = emptyReport();
  installHooks(root, ["claude"], manifest([]), report, { baselines: { ...record } });
  assert.equal(read(root, ".claude/settings.json"), first);
  assert.deepEqual(report.written, []);
  assert.deepEqual(report.refreshedDiverged, []);
});
