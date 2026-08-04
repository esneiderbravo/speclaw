import { test } from "node:test";
import assert from "node:assert/strict";
import { isManaged, MANAGED_TREES, PERSONALIZED } from "../../src/modules/foundation/ownership.js";

test("isManaged is true for a managed tree and its descendants", () => {
  assert.ok(isManaged("ai-specs/skills"));
  assert.ok(isManaged("ai-specs/skills/draft/SKILL.md"));
  assert.ok(isManaged("ai-specs/commands/lawbook/draft.md"));
});

test("isManaged is false for personalized files", () => {
  assert.ok(!isManaged("LAWS.md"));
  assert.ok(!isManaged("docs/standards/testing-standards.md"));
  assert.ok(!isManaged("ai-specs/.speclaw.json"));
});

test("isManaged normalizes Windows separators", () => {
  assert.ok(isManaged("ai-specs\\skills\\draft\\SKILL.md"));
});

test("the managed and personalized trees are disjoint and non-empty", () => {
  assert.ok(MANAGED_TREES.length > 0);
  assert.ok(PERSONALIZED.length > 0);
  for (const p of PERSONALIZED) assert.ok(!MANAGED_TREES.includes(p));
});
