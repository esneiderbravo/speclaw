import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { captureTools, schemaOf, isTextResult } from "../helpers/contracts.js";
import { registerFoundation } from "../../src/modules/foundation/register.js";
import { registerCompass } from "../../src/modules/compass/register.js";
import { registerSpec } from "../../src/modules/lawbook/register.js";
import { registerTools } from "../../src/modules/tools/register.js";
import { CANONICAL_TOOLS } from "../../src/shared/tool-catalog.js";

function captureCanonical(
  register: (server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer) => void,
) {
  process.env.SPECLAW_NO_ALIASES = "1";
  const tools = captureTools(register);
  delete process.env.SPECLAW_NO_ALIASES;
  return tools;
}

test("canonical MCP tools match the consolidated surface", () => {
  const names = new Set([
    ...captureCanonical(registerFoundation).keys(),
    ...captureCanonical(registerCompass).keys(),
    ...captureCanonical(registerSpec).keys(),
    ...captureCanonical(registerTools).keys(),
  ]);
  assert.deepEqual([...names].sort(), [...CANONICAL_TOOLS].sort());
});

test("tool input schemas validate required fields", () => {
  const compass = captureCanonical(registerCompass);
  const explore = schemaOf(compass.get("compass_explore")!);
  assert.throws(() => explore.parse({ projectPath: "/x" }), /node/);
  assert.doesNotThrow(() => explore.parse({ projectPath: "/x", node: "alpha" }));

  const spec = captureCanonical(registerSpec);
  const change = schemaOf(spec.get("lawbook_change")!);
  assert.doesNotThrow(() => change.parse({ projectPath: "/x", action: "list" }));
  assert.throws(
    () => change.parse({ projectPath: "/x", action: "archive", change: "c", date: "bad-date" }),
    /date/,
  );

  const foundation = captureCanonical(registerFoundation);
  const setup = schemaOf(foundation.get("speclaw_setup")!);
  assert.doesNotThrow(() => setup.parse({ projectPath: "/x", action: "init" }));
  assert.throws(
    () => setup.parse({ projectPath: "/x", action: "not-an-action" as "init" }),
    /action/,
  );

  const check = schemaOf(foundation.get("speclaw_check")!);
  assert.throws(() => check.parse({ projectPath: "/x", event: "Nope", payload: {} }));
  assert.doesNotThrow(() =>
    check.parse({ projectPath: "/x", event: "PreToolUse", payload: { file_path: "a" } }),
  );
});

test("foundation handlers wrap their results as MCP text", async (t) => {
  const root = tmpRepo(t);
  const tools = captureCanonical(registerFoundation);

  const setup = await tools.get("speclaw_setup")!.handler({
    projectPath: root,
    action: "init",
  });
  assert.ok(isTextResult(setup));

  const checked = await tools
    .get("speclaw_check")!
    .handler({ projectPath: root, event: "PreToolUse", payload: { file_path: ".env" } });
  assert.ok(isTextResult(checked));
  assert.match((checked as { content: { text: string }[] }).content[0]!.text, /"verdict"/);
});

test("lawbook handlers run the workflow end to end through the transport", async (t) => {
  const root = tmpRepo(t);
  const tools = captureCanonical(registerSpec);

  assert.ok(
    isTextResult(await tools.get("lawbook_change")!.handler({ projectPath: root, action: "init" })),
  );

  const base = "lawbook/changes/demo";
  write(root, `${base}/proposal.md`, "# why");
  write(root, `${base}/tasks.md`, "- [x] done\n");
  write(
    root,
    `${base}/specs/cap/spec.md`,
    "# Cap\n\n### Requirement: R\nThe system SHALL x.\n\n#### Scenario: s\n- Given\n- When\n- Then\n",
  );
  write(root, `${base}/reports/backend.md`, "verdict: pass");

  assert.ok(
    isTextResult(
      await tools
        .get("lawbook_change")!
        .handler({ projectPath: root, action: "validate", change: "demo" }),
    ),
  );
  assert.ok(
    isTextResult(
      await tools
        .get("lawbook_change")!
        .handler({ projectPath: root, action: "sync", change: "demo" }),
    ),
  );
  assert.ok(
    isTextResult(await tools.get("lawbook_change")!.handler({ projectPath: root, action: "list" })),
  );
  assert.ok(
    isTextResult(
      await tools
        .get("lawbook_change")!
        .handler({ projectPath: root, action: "archive", change: "demo", date: "2026-08-04" }),
    ),
  );
});

test("compass handlers wrap their results as MCP text", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  const tools = captureCanonical(registerCompass);

  assert.ok(isTextResult(await tools.get("compass_index")!.handler({ projectPath: root })));
  assert.ok(
    isTextResult(
      await tools.get("compass_find")!.handler({
        projectPath: root,
        query: "alpha",
        mode: "exact",
      }),
    ),
  );
  assert.ok(
    isTextResult(await tools.get("compass_explore")!.handler({ projectPath: root, node: "alpha" })),
  );
  assert.ok(
    isTextResult(
      await tools.get("compass_diff_context")!.handler({ projectPath: root, paths: ["src/a.ts"] }),
    ),
  );
});

test("deprecated alias delegates to canonical surface", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  delete process.env.SPECLAW_NO_ALIASES;
  const tools = captureTools(registerCompass);
  await tools.get("compass_index")!.handler({ projectPath: root });
  const res = await tools.get("compass_search")!.handler({ projectPath: root, query: "alpha" });
  assert.ok(isTextResult(res));
  assert.match((res as { content: { text: string }[] }).content[0]!.text, /\[deprecated\]/);
});
