import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import {
  AGENTS,
  agentById,
  configureAgent,
  detectConfiguredAgents,
  refreshAgents,
} from "../../src/shared/agents.js";
import { emptyReport } from "../../src/shared/install.js";

/** Give a project the ai-specs subdirectories an agent links to. */
function seedAiSpecs(root: string): void {
  for (const sub of ["skills", "commands", "agents", "rules"]) {
    write(root, path.join("ai-specs", sub, ".keep"), "");
  }
}

test("agentById resolves known ids and returns undefined otherwise", () => {
  assert.equal(agentById("claude")?.label, "Claude Code");
  assert.equal(agentById("nope"), undefined);
});

test("configureAgent creates symlinks and writes the MCP config", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  const report = emptyReport();
  configureAgent(root, "claude", report);

  const link = path.join(root, ".claude", "skills");
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.equal(fs.readlinkSync(link), path.join("..", "ai-specs", "skills"));

  const mcp = JSON.parse(read(root, ".mcp.json"));
  assert.equal(mcp.mcpServers.speclaw.command, "npx");
  assert.ok(report.symlinks.length >= 1);
  assert.match(read(root, ".gitignore"), /\.mcp\.json/);
});

test("configureAgent leaves the IDE dir out of .gitignore (user skills stay committable)", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  configureAgent(root, "claude", emptyReport());
  const lines = read(root, ".gitignore")
    .split(/\r?\n/)
    .map((l) => l.trim());
  // speclaw never ignores the agent's IDE dir or its symlinked subdirs — only
  // the MCP config (per-developer wiring) is ignored, from writeMcpConfig.
  for (const entry of [".claude", ".claude/", ".claude/skills", ".claude/commands"]) {
    assert.ok(!lines.includes(entry), `${entry} is not gitignored`);
  }
});

test("configureAgent is idempotent — a second run skips existing links and config", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  configureAgent(root, "claude", emptyReport());
  const report = emptyReport();
  configureAgent(root, "claude", report);
  assert.ok(report.symlinks.length === 0);
  assert.ok(report.skipped.some((s) => s.includes("already registered")));
});

test("configureAgent merges into an existing MCP config without clobbering it", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  write(root, ".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }));
  configureAgent(root, "claude", emptyReport());
  const mcp = JSON.parse(read(root, ".mcp.json"));
  assert.equal(mcp.mcpServers.other.command, "x");
  assert.ok(mcp.mcpServers.speclaw);
});

test("configureAgent handles an agent without an MCP file (no .mcp.json written)", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  configureAgent(root, "agents", emptyReport());
  assert.ok(has(root, ".agents/skills"));
  assert.ok(!has(root, ".mcp.json"));
});

test("configureAgent throws on an unknown agent id", (t) => {
  const root = tmpRepo(t);
  assert.throws(() => configureAgent(root, "ghost", emptyReport()), /Unknown agent/);
});

test("detectConfiguredAgents lists agents whose IDE dir exists", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  assert.deepEqual(detectConfiguredAgents(root), []);
  configureAgent(root, "cursor", emptyReport());
  assert.deepEqual(detectConfiguredAgents(root), ["cursor"]);
});

test("refreshAgents re-runs configuration for already-configured agents", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  configureAgent(root, "codex", emptyReport());
  // add a new linkable dir, then refresh
  const report = emptyReport();
  refreshAgents(root, report);
  // codex links skills+commands; both already exist, so all are skipped
  assert.ok(report.symlinks.length === 0);
});

test("every AGENTS entry has an id, label, ideDir, and link targets", () => {
  for (const a of AGENTS) {
    assert.ok(a.id && a.label && a.ideDir);
    assert.ok(a.linkTargets.length > 0);
  }
});
