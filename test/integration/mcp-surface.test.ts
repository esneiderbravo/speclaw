import { test } from "node:test";
import assert from "node:assert/strict";
import { captureTools } from "../helpers/contracts.js";
import { registerFoundation } from "../../src/modules/foundation/register.js";
import { registerCompass } from "../../src/modules/compass/register.js";
import { registerCortex } from "../../src/modules/cortex/register.js";
import { registerSpec } from "../../src/modules/lawbook/register.js";
import { registerTools } from "../../src/modules/tools/register.js";
import {
  CANONICAL_TOOLS,
  isCanonicalTool,
  MAX_CANONICAL_TOOLS,
} from "../../src/shared/tool-catalog.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildServer } from "../../src/server.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { tmpRepo, write } from "../helpers/env.js";

test("full profile registers exactly nine canonical MCP tools", () => {
  process.env.SPECLAW_NO_ALIASES = "1";
  const all = new Set([
    ...captureTools(registerFoundation).keys(),
    ...captureTools(registerCompass).keys(),
    ...captureTools(registerCortex).keys(),
    ...captureTools(registerSpec).keys(),
    ...captureTools(registerTools).keys(),
  ]);
  delete process.env.SPECLAW_NO_ALIASES;
  const canonical = [...all].filter(isCanonicalTool).sort();
  assert.equal(canonical.length, MAX_CANONICAL_TOOLS);
  assert.deepEqual(canonical, [...CANONICAL_TOOLS].sort());
});

test("alias descriptions stay within twelve words", () => {
  delete process.env.SPECLAW_NO_ALIASES;
  for (const [name, tool] of captureTools(registerCompass)) {
    if (isCanonicalTool(name)) continue;
    const words = tool.config.description!.trim().split(/\s+/).length;
    assert.ok(words <= 12, `${name} description is ${words} words`);
  }
});

async function connect(minimal: boolean): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildServer({ minimal }).connect(serverSide);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
  return client;
}

test("the code-reading and bug tools load up front, and instructions name a tool per job", async () => {
  const client = await connect(false);
  const { tools } = await client.listTools();
  const eager = tools.filter((t) => t._meta?.["anthropic/alwaysLoad"] === true).map((t) => t.name);
  assert.deepEqual(eager.sort(), [
    "compass_diff_context",
    "compass_explore",
    "compass_find",
    "lawbook_investigate",
  ]);
  const instructions = client.getInstructions() ?? "";
  assert.match(instructions, /compass_explore/);
  assert.match(instructions, /lawbook_investigate/);
  await client.close();
});

test("a minimal server still answers the hooks' speclaw_check", async () => {
  const client = await connect(true);
  const names = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(names.includes("speclaw_check"));
  assert.ok(names.includes("lawbook_investigate"));
  await client.close();
});

/** A throwaway git repo with a lawbook, on a feature branch whose diff spans five modules. */
function multiModuleBranch(t: Parameters<typeof tmpRepo>[0]): string {
  const root = tmpRepo(t);
  const git = (...args: string[]) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  specInit(root);
  write(root, "a.js", "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-qm", "init");
  git("checkout", "-qb", "feat/widget");
  for (let m = 0; m < 5; m++) {
    for (let f = 0; f < 3; f++) write(root, `src/m${m}/f${f}.js`, `export const v = ${f};\n`);
  }
  return root;
}

test("speclaw_check carries the documentation hint for its doc group and Bash, in the project it names", async (t) => {
  const root = multiModuleBranch(t);
  const client = await connect(false);
  const call = async (payload: Record<string, unknown>, toolName: string) =>
    JSON.parse(
      (
        (await client.callTool({
          name: "speclaw_check",
          arguments: { projectPath: root, event: "PostToolUse", toolName, payload },
        })) as { content: Array<{ text: string }> }
      ).content[0]!.text,
    ) as { verdict: string; hookSpecificOutput?: { additionalContext: string } };

  const first = await call({ speclaw_hint: "doc", tool_input: {} }, "Edit");
  assert.equal(first.verdict, "allow");
  assert.match(first.hookSpecificOutput?.additionalContext ?? "", /measures level [1-3]/);
  assert.ok(fs.existsSync(path.join(root, "lawbook", "changes", "widget", "change.json")));

  const again = await call({ tool_input: { command: "npm test" } }, "Bash");
  assert.equal(again.verdict, "allow");
  assert.equal(again.hookSpecificOutput, undefined, "told once per change and level");
  await client.close();
});
