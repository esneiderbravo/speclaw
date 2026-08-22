import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { seedSampleRepo, sampleProfile } from "../helpers/fixtures.js";
import { captureTools, schemaOf, isTextResult } from "../helpers/contracts.js";
import { registerFoundation } from "../../src/modules/foundation/register.js";
import { registerCompass } from "../../src/modules/compass/register.js";
import { registerSpec } from "../../src/modules/lawbook/register.js";
import { registerTools } from "../../src/modules/tools/register.js";
import { loadPacks } from "../../src/modules/tools/packs.js";

test("each register function declares its expected tools", () => {
  assert.deepEqual([...captureTools(registerFoundation).keys()].sort(), [
    "configure_agent",
    "doctor",
    "init_project",
    "law_verify",
    "scaffold",
    "speclaw_check",
  ]);
  assert.deepEqual([...captureTools(registerCompass).keys()].sort(), [
    "compass_explore",
    "compass_impact",
    "compass_index",
    "compass_recall",
    "compass_search",
    "compass_trace",
    "compass_visualize",
    "compass_watch",
  ]);
  assert.deepEqual([...captureTools(registerSpec).keys()].sort(), [
    "lawbook_archive",
    "lawbook_init",
    "lawbook_list",
    "lawbook_sync",
    "lawbook_validate",
  ]);
  assert.deepEqual([...captureTools(registerTools).keys()].sort(), ["add_pack", "list_packs"]);
});

test("tool input schemas validate required fields", () => {
  const compass = captureTools(registerCompass);
  const explore = schemaOf(compass.get("compass_explore")!);
  assert.throws(() => explore.parse({ projectPath: "/x" }), /node/);
  assert.doesNotThrow(() => explore.parse({ projectPath: "/x", node: "alpha" }));

  const spec = captureTools(registerSpec);
  const archive = schemaOf(spec.get("lawbook_archive")!);
  assert.throws(() => archive.parse({ projectPath: "/x", change: "c", date: "not-a-date" }));
  assert.doesNotThrow(() => archive.parse({ projectPath: "/x", change: "c", date: "2026-08-04" }));

  const foundation = captureTools(registerFoundation);
  const configure = schemaOf(foundation.get("configure_agent")!);
  assert.throws(() => configure.parse({ projectPath: "/x", agent: "ghost" }));

  const check = schemaOf(foundation.get("speclaw_check")!);
  assert.throws(() => check.parse({ projectPath: "/x", event: "Nope", payload: {} }));
  assert.doesNotThrow(() =>
    check.parse({ projectPath: "/x", event: "PreToolUse", payload: { file_path: "a" } }),
  );

  const verify = schemaOf(foundation.get("law_verify")!);
  assert.throws(() => verify.parse({ projectPath: "/x", engines: ["nope"] }));
  assert.doesNotThrow(() => verify.parse({ projectPath: "/x" }));
  assert.doesNotThrow(() => verify.parse({ projectPath: "/x", engines: ["deps", "graph"] }));
});

test("the law_verify description stays within the word ceiling", () => {
  const verify = captureTools(registerFoundation).get("law_verify")!;
  const words = verify.config.description!.trim().split(/\s+/).length;
  assert.ok(words <= 25, `law_verify description is ${words} words (must be ≤ 25)`);
});

test("foundation handlers wrap their results as MCP text", async (t) => {
  const root = tmpRepo(t);
  const tools = captureTools(registerFoundation);

  const init = await tools.get("init_project")!.handler({ projectPath: root });
  assert.ok(isTextResult(init));

  const scaffolded = await tools
    .get("scaffold")!
    .handler({ projectPath: root, profile: sampleProfile(), packs: [], agents: ["claude"] });
  assert.ok(isTextResult(scaffolded));

  const configured = await tools
    .get("configure_agent")!
    .handler({ projectPath: root, agent: "cursor" });
  assert.ok(isTextResult(configured));

  const health = await tools.get("doctor")!.handler({ projectPath: root });
  assert.ok(isTextResult(health));
  assert.match((health as { content: { text: string }[] }).content[0]!.text, /"healthy"/);

  const checked = await tools
    .get("speclaw_check")!
    .handler({ projectPath: root, event: "PreToolUse", payload: { file_path: ".env" } });
  assert.ok(isTextResult(checked));
  assert.match((checked as { content: { text: string }[] }).content[0]!.text, /"verdict"/);
});

test("lawbook handlers run the workflow end to end through the transport", async (t) => {
  const root = tmpRepo(t);
  const tools = captureTools(registerSpec);

  assert.ok(isTextResult(await tools.get("lawbook_init")!.handler({ projectPath: root })));

  // seed an archivable change
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
      await tools.get("lawbook_validate")!.handler({ projectPath: root, change: "demo" }),
    ),
  );
  assert.ok(
    isTextResult(await tools.get("lawbook_sync")!.handler({ projectPath: root, change: "demo" })),
  );
  assert.ok(isTextResult(await tools.get("lawbook_list")!.handler({ projectPath: root })));
  assert.ok(
    isTextResult(
      await tools
        .get("lawbook_archive")!
        .handler({ projectPath: root, change: "demo", date: "2026-08-04" }),
    ),
  );
});

test("compass handlers wrap their results as MCP text", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  const tools = captureTools(registerCompass);

  assert.ok(isTextResult(await tools.get("compass_index")!.handler({ projectPath: root })));
  assert.ok(
    isTextResult(await tools.get("compass_search")!.handler({ projectPath: root, query: "alpha" })),
  );
  assert.ok(
    isTextResult(await tools.get("compass_explore")!.handler({ projectPath: root, node: "alpha" })),
  );
  assert.ok(
    isTextResult(
      await tools.get("compass_recall")!.handler({ projectPath: root, query: "render" }),
    ),
  );
  assert.ok(
    isTextResult(await tools.get("compass_impact")!.handler({ projectPath: root, node: "gamma" })),
  );
  assert.ok(
    isTextResult(
      await tools.get("compass_trace")!.handler({ projectPath: root, from: "alpha", to: "gamma" }),
    ),
  );
  assert.ok(isTextResult(await tools.get("compass_visualize")!.handler({ projectPath: root })));

  for (const action of ["start", "status", "stop"] as const) {
    assert.ok(
      isTextResult(await tools.get("compass_watch")!.handler({ projectPath: root, action })),
    );
  }
});

test("tools handlers list and add packs through the transport", async (t) => {
  const root = tmpRepo(t);
  const tools = captureTools(registerTools);

  assert.ok(isTextResult(await tools.get("list_packs")!.handler({})));

  const [pack] = Object.keys(loadPacks());
  // add_pack refreshes agents; seed a configured agent so that path runs too
  write(root, "ai-specs/skills/.keep", "");
  const added = await tools.get("add_pack")!.handler({ projectPath: root, pack, vars: {} });
  assert.ok(isTextResult(added));
});
