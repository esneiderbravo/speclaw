import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collectRegisteredTools } from "../../src/modules/foundation/context-budget.js";
import { measureBudget } from "../../src/shared/budget.js";
import { loadDeclaredBudget } from "../../src/shared/exposure.js";
import {
  CANONICAL_TOOLS,
  isCanonicalTool,
  MAX_CANONICAL_TOOLS,
} from "../../src/shared/tool-catalog.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("eight canonical tools stay under declared definition-token ceiling", () => {
  process.env.SPECLAW_NO_ALIASES = "1";
  const tools = collectRegisteredTools(false).filter((t) => isCanonicalTool(t.name));
  assert.equal(tools.length, MAX_CANONICAL_TOOLS);
  assert.deepEqual(tools.map((t) => t.name).sort(), [...CANONICAL_TOOLS].sort());
  const declared = loadDeclaredBudget(ROOT);
  const actual = measureBudget({
    projectPath: ROOT,
    packagePath: ROOT,
    tools,
    minimal: false,
  });
  assert.ok(
    actual.tools <= declared.surfaces.tools,
    `canonical tools cost ${actual.tools} > cap ${declared.surfaces.tools}`,
  );
  delete process.env.SPECLAW_NO_ALIASES;
});
