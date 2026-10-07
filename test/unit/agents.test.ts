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
  mcpEntry,
  refreshAgents,
} from "../../src/shared/agents.js";
import { pkgName, pkgVersion } from "../../src/shared/version.js";
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

test("configureAgent gitignores an IDE dir it creates, never a pre-existing one", (t) => {
  const root = tmpRepo(t);
  seedAiSpecs(root);
  configureAgent(root, "agents", emptyReport());
  const lines = (): string[] =>
    read(root, ".gitignore")
      .split(/\r?\n/)
      .map((l) => l.trim());
  // The folder holds only links into the gitignored ai-specs/: tool config.
  assert.ok(lines().includes(".agents/"), ".agents/ is gitignored");

  write(root, ".claude/settings.json", "{}\n");
  configureAgent(root, "claude", emptyReport());
  assert.ok(!lines().includes(".claude/"), "a pre-existing .claude/ is the user's");
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

const PINNED = () => ["-y", `${pkgName()}@${pkgVersion()}`, "mcp"];

/** Configure claude over a pre-existing `.mcp.json` speclaw entry and return the result. */
function configureOver(t: Parameters<typeof tmpRepo>[0], entry: unknown) {
  const root = tmpRepo(t);
  write(root, ".mcp.json", JSON.stringify({ mcpServers: { speclaw: entry } }, null, 2));
  const report = emptyReport();
  configureAgent(root, "claude", report);
  return { mcp: JSON.parse(read(root, ".mcp.json")), report };
}

// Covers: req~mcp-entry-pinned~1
test("a fresh MCP config is pinned to the running version", (t) => {
  const root = tmpRepo(t);
  configureAgent(root, "claude", emptyReport());
  const mcp = JSON.parse(read(root, ".mcp.json"));
  assert.deepEqual(mcp.mcpServers.speclaw, { type: "stdio", command: "npx", args: PINNED() });
  assert.deepEqual(mcpEntry().args, PINNED());
});

// Covers: req~mcp-entry-pinned~1
test("a stock unpinned entry is re-pinned and the rewrite is reported", (t) => {
  const { mcp, report } = configureOver(t, {
    type: "stdio",
    command: "npx",
    args: ["-y", pkgName(), "mcp"],
  });
  assert.deepEqual(mcp.mcpServers.speclaw.args, PINNED());
  assert.ok(report.written.some((w) => w.includes(`speclaw MCP entry pinned to ${pkgVersion()}`)));
});

// Covers: req~mcp-entry-pinned~1
test("an entry pinned to an older version is re-pinned", (t) => {
  const { mcp } = configureOver(t, { command: "npx", args: ["-y", `${pkgName()}@2.0.1`, "mcp"] });
  assert.deepEqual(mcp.mcpServers.speclaw.args, PINNED());
  assert.equal(mcp.mcpServers.speclaw.type, "stdio");
});

// Covers: req~mcp-entry-pinned~1
test("a custom speclaw entry is kept and reported", (t) => {
  const custom = { command: "node", args: ["/work/speclaw/dist/cli/index.js", "mcp"] };
  const { mcp, report } = configureOver(t, custom);
  assert.deepEqual(mcp.mcpServers.speclaw, custom);
  assert.ok(report.skipped.some((s) => s.includes("custom speclaw entry kept")));
  const withEnv = configureOver(t, { command: "npx", args: PINNED(), env: { X: "1" } });
  assert.ok(withEnv.report.skipped.some((s) => s.includes("custom speclaw entry kept")));
});

// Covers: req~mcp-entry-pinned~1
test("an entry already pinned to this version is left as is", (t) => {
  const { report } = configureOver(t, { type: "stdio", command: "npx", args: PINNED() });
  assert.ok(report.skipped.some((s) => s.includes("already registered")));
});
