import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALIAS_NAMES, CANONICAL_TOOLS } from "../../src/shared/tool-catalog.js";

const ASSETS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/lawbook/assets",
);

function read(rel: string): string {
  return fs.readFileSync(path.join(ASSETS, rel), "utf8");
}

test("explore summarize emits a complete brief the planner can reuse", () => {
  const body = read("skills/explore/steps/02-summarize.md");
  for (const field of [
    "symbols, each with its file",
    "callers and callees",
    "blast radius",
    "standards in `docs/standards/` already read",
    "recommended approach",
    "open questions",
    "nothing unresolved",
  ]) {
    assert.ok(body.includes(field), `summarize missing ${field}`);
  }
  assert.match(body, /workflow complete/i);
});

test("cortex dispatch pastes the explorer brief into the planner prompt", () => {
  const body = read("skills/cortex/steps/02-dispatch-loop.md");
  assert.match(body, /When the role is the planner, paste the explorer brief/);
  assert.match(body, /steps\/03-complete\.md/);
});

test("draft reuses a complete explorer brief and locates only without one", () => {
  const body = read("skills/draft/steps/02-understand.md");
  assert.match(body, /complete explorer brief/);
  assert.match(body, /that brief is the code map/);
  assert.match(body, /only for a gap the brief names/);
  assert.match(body, /When the handoff has no complete explorer brief/);
  assert.match(body, /compass_index/);
  assert.match(body, /steps\/03-name-capabilities\.md/);
});

test("planner agent does not re-investigate a complete brief", () => {
  const body = read("agents/planner.md");
  assert.match(body, /A complete explorer brief is the code map/);
  assert.match(body, /Do not re-investigate it/);
});

test("explore investigates through compass_find/explore before indexing or reading", () => {
  const body = read("skills/explore/steps/01-investigate.md");
  const find = body.indexOf("compass_find");
  const index = body.indexOf("compass_index");
  assert.ok(find >= 0 && index > find, "compass_find is named before compass_index");
  assert.match(body, /`compass_index` only when `compass_find`\s+returns nothing/);
  assert.match(body, /name which Rule 1 fallback holds/);
  assert.doesNotMatch(body, /Refresh the index first/);
});

test("explore summarize brief carries the Compass call count", () => {
  assert.match(read("skills/explore/steps/02-summarize.md"), /`Compass calls made: N`/);
});

test("explorer and planner list canonical tool names only", () => {
  const explorer = read("agents/explorer.md");
  const planner = read("agents/planner.md");
  for (const tool of ["compass_explore", "compass_find", "compass_diff_context", "compass_index"]) {
    assert.match(explorer, new RegExp(`mcp__speclaw__${tool}\\b`));
  }
  assert.match(explorer, /mcp__speclaw__lawbook_change\b/);
  assert.doesNotMatch(explorer, /compass_impact|compass_trace/);
  assert.match(planner, /mcp__speclaw__lawbook_change\b/);
  assert.doesNotMatch(planner, /lawbook_level/);
});

test("cortex dispatch runs one question round and an explorer template without paths", () => {
  const body = read("skills/cortex/steps/02-dispatch-loop.md");
  assert.match(body, /Explorer template/);
  assert.match(body, /intent/);
  assert.match(body, /symbols or concepts/);
  assert.match(body, /Do not\s+list file paths for the explorer to read/);
  assert.match(body, /mode `propose`/);
  assert.match(body, /\*\*one\*\* `advance` with `pauseForQuestions`/);
  assert.match(body, /mode `set`/);
});

test("draft skips level confirmation when confirmed and names the draft scaffold", () => {
  assert.match(
    read("skills/draft/steps/02-understand.md"),
    /already has a `confirmedLevel`[\s\S]*skip the separate level\s+confirmation/,
  );
  const write = read("skills/draft/steps/04-write-artifacts.md");
  assert.match(write, /speclaw lawbook draft <name> --level N/);
  assert.match(write, /`lawbook_change`\s+action `draft`/);
});

/** Every shipped markdown file under an assets dir (default: the lawbook assets). */
function shippedMarkdown(dir = ASSETS): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...shippedMarkdown(abs));
    else if (e.name.endsWith(".md")) out.push(abs);
  }
  return out;
}

const FOUNDATION_ASSETS = path.resolve(ASSETS, "../../foundation/assets");

test("no shipped agent, skill, command, rule, or template names a deprecated alias tool", () => {
  const files = [...shippedMarkdown(), ...shippedMarkdown(FOUNDATION_ASSETS)];
  assert.ok(files.length > 20, "assets were found");
  assert.ok(
    files.some((f) => f.endsWith("CLAUDE.template.md")),
    "foundation templates are scanned",
  );
  for (const file of files) {
    const body = fs.readFileSync(file, "utf8");
    for (const alias of ALIAS_NAMES) {
      assert.doesNotMatch(
        body,
        new RegExp(`\\b${alias}\\b`),
        `${path.relative(path.dirname(ASSETS), file)} names alias ${alias}`,
      );
    }
  }
});

test("agent tools lists name only always-registered canonical speclaw tools", () => {
  const canonical = new Set<string>(CANONICAL_TOOLS);
  for (const name of fs.readdirSync(path.join(ASSETS, "agents"))) {
    const tools = /^tools:\s*(.*)$/m.exec(read(`agents/${name}`))?.[1] ?? "";
    for (const m of tools.matchAll(/mcp__speclaw__([a-z_]+)/g)) {
      assert.ok(canonical.has(m[1]!), `agents/${name} lists non-canonical ${m[1]}`);
    }
  }
});
