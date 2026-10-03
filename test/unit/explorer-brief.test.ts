import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
