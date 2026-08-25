import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultBudget,
  estimateTokens,
  fitToBudget,
  renderTreeContext,
  type BudgetHit,
} from "../../src/modules/compass/budget.js";

test("estimateTokens scales with length", () => {
  assert.ok(estimateTokens("abcd") >= 1);
  assert.ok(estimateTokens("x".repeat(400)) > estimateTokens("x".repeat(40)));
});

test("fitToBudget never returns empty for non-empty hits", () => {
  const hits: BudgetHit[] = Array.from({ length: 20 }, (_, i) => ({
    name: `fn${i}`,
    kind: "function",
    file: "a.ts",
    line: i + 1,
    signature: `function fn${i}()`,
    excerpt: "line\n".repeat(50),
  }));
  const r = fitToBudget(hits, 200);
  assert.ok(r.hitCount >= 1);
  assert.ok(r.rendered.length > 0);
  assert.ok(r.tokens <= 200 * 1.2 || r.hitCount === 1);
});

test("renderTreeContext inserts elision markers", () => {
  const text = renderTreeContext([
    { name: "a", kind: "function", file: "f.ts", line: 1, signature: "a()" },
    { name: "b", kind: "function", file: "f.ts", line: 40, signature: "b()" },
  ]);
  assert.match(text, /⋮/);
});

test("defaultBudget expands without focus", () => {
  assert.ok(defaultBudget(false) > defaultBudget(true));
});
