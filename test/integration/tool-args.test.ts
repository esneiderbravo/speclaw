import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../../src/server.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { resolveActiveChange } from "../../src/modules/lawbook/ship.js";
import { tmpRepo, write, has, read } from "../helpers/env.js";

// Every call below is one real agents sent in ftd-admin-finanzas that failed on
// a missing or misnamed argument speclaw can work out itself.

const VALID_SPEC = `# Cap

### Requirement: Thing
The system SHALL do the thing.

#### Scenario: happy
- Given a context
- When an action
- Then an outcome
`;

/** A complete change whose delta spec was never synced into lawbook/specs/. */
function seedReady(root: string, name: string): void {
  const base = `lawbook/changes/${name}`;
  write(root, `${base}/proposal.md`, "# Proposal\nwhy");
  write(root, `${base}/design.md`, "# Design\napproach");
  write(root, `${base}/tasks.md`, "- [x] do a thing\n");
  write(root, `${base}/specs/cap/spec.md`, VALID_SPEC);
  write(root, `${base}/reports/backend.md`, "# backend\nverdict: pass");
  write(
    root,
    `${base}/harness.json`,
    JSON.stringify({
      version: 1,
      change: name,
      stage: "archiving",
      level: 3,
      iteration: 0,
      maxRework: 3,
      verdicts: { review: "PASS", test: "PASS" },
      openQuestions: [],
      history: [],
    }) + "\n",
  );
}

async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildServer({}).connect(serverSide);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ text: string }>;
    isError?: boolean;
  };
  return { text: r.content[0]?.text ?? "", isError: r.isError === true };
}

function gitRepo(root: string, branch: string): void {
  const git = (...args: string[]) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  write(root, "a.js", "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-qm", "init");
  git("checkout", "-qb", branch);
}

test("archive with neither date nor change archives the only active change and syncs its spec", async (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedReady(root, "widget");
  const client = await connect();
  const today = new Date().toISOString().slice(0, 10);
  const r = await call(client, "lawbook_change", { projectPath: root, action: "archive" });
  assert.equal(r.isError, false, r.text);
  assert.ok(has(root, `lawbook/changes/archive/${today}-widget/tasks.md`));
  assert.ok(has(root, "lawbook/specs/cap/spec.md"), "archive promoted the unsynced delta");
  await client.close();
});

test("`create` and `name` draft a change; a comma-separated `paths` is a list", async (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const client = await connect();
  const drafted = await call(client, "lawbook_change", {
    projectPath: root,
    action: "create",
    name: "add-widget",
    level: 1,
  });
  assert.equal(drafted.isError, false, drafted.text);
  assert.ok(has(root, "lawbook/changes/add-widget/change.json"));
  write(root, "src/a.ts", "export const a = 1;\n");
  write(root, "src/b.ts", "export const b = 1;\n");
  const proposed = await call(client, "lawbook_change", {
    projectPath: root,
    action: "level",
    mode: "propose",
    paths: "src/a.ts, src/b.ts",
  });
  assert.equal(proposed.isError, false, proposed.text);
  await client.close();
});

test("level set without a change sets it on the change this branch ships", async (t) => {
  const root = tmpRepo(t);
  gitRepo(root, "feat/FAR-1360-default-cost-center");
  specInit(root);
  seedReady(root, "default-cost-center");
  seedReady(root, "unrelated");
  assert.equal(resolveActiveChange(root), "default-cost-center");
  const client = await connect();
  const r = await call(client, "lawbook_change", {
    projectPath: root,
    action: "level",
    mode: "set",
    level: 2,
    reason: "confirmed",
  });
  assert.equal(r.isError, false, r.text);
  const level = (name: string) =>
    has(root, `lawbook/changes/${name}/change.json`)
      ? (
          JSON.parse(read(root, `lawbook/changes/${name}/change.json`)) as {
            confirmedLevel?: number;
          }
        ).confirmedLevel
      : undefined;
  assert.equal(level("default-cost-center"), 2);
  assert.notEqual(level("unrelated"), 2);
  await client.close();
});

test("an ambiguous or empty project names the changes instead of guessing", async (t) => {
  const root = tmpRepo(t);
  gitRepo(root, "feat/something-else");
  specInit(root);
  const client = await connect();
  const none = await call(client, "lawbook_change", { projectPath: root, action: "validate" });
  assert.equal(none.isError, true);
  assert.match(none.text, /no active change; draft one first/);
  seedReady(root, "one");
  seedReady(root, "two");
  assert.equal(resolveActiveChange(root), null);
  const two = await call(client, "lawbook_change", { projectPath: root, action: "sync" });
  assert.equal(two.isError, true);
  assert.match(two.text, /active: one, two/);
  await client.close();
});

test("cortex on an undrafted change says to draft it first", async (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedReady(root, "widget");
  const client = await connect();
  const r = await call(client, "cortex", { projectPath: root, action: "start", change: "gadget" });
  assert.equal(r.isError, true);
  assert.match(r.text, /draft it first .*; active: widget/);
  await client.close();
});

test("compass_explore with a search phrase and no node answers as a find", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", "export function visibleTo() { return 1; }\n");
  const client = await connect();
  await call(client, "compass_index", { projectPath: root });
  const r = await call(client, "compass_explore", {
    projectPath: root,
    query: "visibleTo request visibility rule",
  });
  assert.equal(r.isError, false, r.text);
  assert.doesNotMatch(r.text, /Input validation error/);
  assert.match(r.text, /visibleTo/);
  const bare = await call(client, "compass_explore", { projectPath: root });
  assert.equal(bare.isError, true);
  assert.match(bare.text, /requires 'node'/);
  await client.close();
});
