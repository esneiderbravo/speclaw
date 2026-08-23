import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  applyTextBudget,
  budgetExploreShape,
  OUTPUT_BUDGET,
} from "../../src/shared/output-budget.js";

test("estimateTokens is deterministic and monotonic", () => {
  const a = estimateTokens("hello");
  const b = estimateTokens("hello world");
  assert.equal(a, estimateTokens("hello"));
  assert.ok(b > a);
});

test("applyTextBudget truncates over-budget text", () => {
  const long = "x".repeat(OUTPUT_BUDGET.brief * 4 + 100);
  const out = applyTextBudget(long, "brief");
  assert.ok(out.truncated);
  assert.ok(estimateTokens(out.text) <= OUTPUT_BUDGET.brief + 5);
});

test("budgetExploreShape preserves caller totals when truncating", () => {
  const truncated: { field: string; omitted: number; hint: string }[] = [];
  const value: Record<string, unknown> = {
    callers: Array.from({ length: 50 }, (_, i) => ({ name: `c${i}` })),
    symbol: { source: "line\n".repeat(100) },
  };
  budgetExploreShape(value, "brief", truncated);
  assert.equal(value.callersTotal, 50);
  assert.ok(truncated.length > 0);
});
