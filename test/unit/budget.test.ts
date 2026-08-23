import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { formatBudgetTable, measureBudget } from "../../src/shared/budget.js";
import { loadDeclaredBudget, packageRoot } from "../../src/shared/exposure.js";
import { toolDefinitionTokens } from "../../src/shared/schema-tokens.js";
import { collectRegisteredTools } from "../../src/modules/foundation/context-budget.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("tool schema size affects definition cost", () => {
  const small = toolDefinitionTokens({
    name: "t",
    description: "same description for both tools here.",
    inputSchema: { a: z.string() },
  });
  const large = toolDefinitionTokens({
    name: "t",
    description: "same description for both tools here.",
    inputSchema: {
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.object({ x: z.string(), y: z.number(), z: z.boolean() }),
    },
  });
  assert.ok(large > small, `expected ${large} > ${small}`);
});

test("context budget is not exceeded", () => {
  process.env.SPECLAW_NO_ALIASES = "1";
  const declared = loadDeclaredBudget(ROOT);
  const tools = collectRegisteredTools(false);
  const actual = measureBudget({
    projectPath: ROOT,
    packagePath: ROOT,
    tools,
    minimal: false,
  });
  assert.ok(
    actual.total <= declared.total,
    `context budget exceeded: ${actual.total} > ${declared.total}\n` +
      formatBudgetTable(actual, declared),
  );
  assert.ok(actual.tools <= declared.surfaces.tools, `tools surface over: ${actual.tools}`);
  assert.ok(
    actual.skillsAndCommands <= declared.surfaces.skillsAndCommands,
    `skills surface over: ${actual.skillsAndCommands}`,
  );
  assert.ok(
    actual.alwaysOnInstructions <= declared.surfaces.alwaysOnInstructions,
    `instructions surface over: ${actual.alwaysOnInstructions}`,
  );
  delete process.env.SPECLAW_NO_ALIASES;
});

test("minimal profile registers fewer tools and stays under minimal ceilings", () => {
  process.env.SPECLAW_NO_ALIASES = "1";
  const declared = loadDeclaredBudget(ROOT);
  const full = collectRegisteredTools(false);
  const mini = collectRegisteredTools(true);
  assert.ok(mini.length < full.length);
  assert.equal(mini.length, 4);
  const actual = measureBudget({
    projectPath: ROOT,
    packagePath: ROOT,
    tools: mini,
    minimal: true,
  });
  assert.ok(actual.tools <= declared.minimal.tools);
  assert.ok(actual.total <= declared.minimal.total);
  delete process.env.SPECLAW_NO_ALIASES;
});

test("packageRoot finds token-budget.json", () => {
  assert.ok(fs.existsSync(path.join(packageRoot(), "token-budget.json")));
});
