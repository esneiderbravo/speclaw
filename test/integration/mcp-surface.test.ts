import { test } from "node:test";
import assert from "node:assert/strict";
import { captureTools } from "../helpers/contracts.js";
import { registerFoundation } from "../../src/modules/foundation/register.js";
import { registerCompass } from "../../src/modules/compass/register.js";
import { registerSpec } from "../../src/modules/lawbook/register.js";
import { registerTools } from "../../src/modules/tools/register.js";
import {
  CANONICAL_TOOLS,
  isCanonicalTool,
  MAX_CANONICAL_TOOLS,
} from "../../src/shared/tool-catalog.js";

test("full profile registers exactly eight canonical MCP tools", () => {
  process.env.SPECLAW_NO_ALIASES = "1";
  const all = new Set([
    ...captureTools(registerFoundation).keys(),
    ...captureTools(registerCompass).keys(),
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
