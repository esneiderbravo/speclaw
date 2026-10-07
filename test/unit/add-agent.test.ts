import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { addAgent } from "../../src/modules/foundation/scaffold.js";
import { emptyReport } from "../../src/shared/install.js";
import { readManifest, writeManifest } from "../../src/shared/manifest.js";

/** Give a project the ai-specs subdirectories an agent links to. */
function seedAiSpecs(root: string): void {
  for (const sub of ["skills", "commands", "agents", "rules"]) {
    write(root, path.join("ai-specs", sub, ".keep"), "");
  }
}

/** The hook commands speclaw installed for one event of `.claude/settings.json`. */
function commandsFor(root: string, event: string): string[] {
  const settings = JSON.parse(read(root, ".claude/settings.json"));
  return (settings.hooks[event] ?? []).flatMap((g: { hooks: Array<{ command?: string }> }) =>
    g.hooks.map((h) => h.command ?? ""),
  );
}

test("addAgent wires Claude Code with links, MCP entry, and session hooks", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  const result = addAgent(root, "claude", emptyReport());

  assert.deepEqual(result.hooked, ["claude"]);
  assert.ok(has(root, ".claude/skills"));
  assert.ok(JSON.parse(read(root, ".mcp.json")).mcpServers.speclaw);
  assert.ok(commandsFor(root, "SessionStart").some((c) => c.includes("session-start")));
  assert.ok(commandsFor(root, "PostToolUse").some((c) => c.includes("reindex-file")));
  assert.ok(commandsFor(root, "Stop").some((c) => c.includes("ship-on-stop")));
});

test("addAgent keeps foreign hooks and records the settings baseline", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  writeManifest(root, "0.0.0", []);
  const foreign = { type: "command", command: "echo mine" };
  write(
    root,
    ".claude/settings.json",
    JSON.stringify({ hooks: { Stop: [{ hooks: [foreign] }] } }, null, 2),
  );

  addAgent(root, "claude", emptyReport());

  assert.ok(commandsFor(root, "Stop").includes("echo mine"));
  assert.ok(readManifest(root)?.baselines[".claude/settings.json"]);
  assert.equal(readManifest(root)?.version, "0.0.0");
});

test("addAgent on an agent without hooks configures it and reports it unhooked", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  const result = addAgent(root, "cursor", emptyReport());
  assert.deepEqual(result.unhooked, ["cursor"]);
  assert.ok(has(root, ".cursor/mcp.json"));
  assert.ok(!has(root, ".claude/settings.json"));
});

test("addAgent throws on an unknown agent id", (t) => {
  const root = tmpRepo(t);
  assert.throws(() => addAgent(root, "ghost", emptyReport()), /Unknown agent/);
});
