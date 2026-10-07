import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  applyTextBudget,
  budgetExploreShape,
  OUTPUT_BUDGET,
} from "../../src/shared/output-budget.js";
import { text } from "../../src/shared/mcp.js";

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

// Covers: req~find-response-budget~1
test("full-mode truncation hint does not suggest mode full", () => {
  const long = "y".repeat(OUTPUT_BUDGET.full * 4 + 400);
  const out = applyTextBudget(long, "full");
  assert.ok(out.truncated);
  assert.match(out.text, /\[truncated/);
  assert.ok(!out.text.includes('mode:"full"'), out.text.slice(-120));
  assert.ok(estimateTokens(out.text) <= OUTPUT_BUDGET.full);
});

// Covers: req~find-response-budget~1
test("an explicit token cap trims to that cap with a truthful hint", () => {
  const long = "z".repeat(4000);
  const out = applyTextBudget(long, { maxTokens: 300 });
  assert.ok(out.truncated);
  assert.ok(estimateTokens(out.text) <= 300, String(estimateTokens(out.text)));
  assert.ok(!out.text.includes('mode:"full"'));
  const fits = applyTextBudget("short", { maxTokens: 300 });
  assert.equal(fits.truncated, false);
  assert.equal(fits.text, "short");
});

// Covers: req~find-response-budget~1
test("text() keeps its brief default and accepts an opt-in budget", () => {
  const long = "w".repeat(OUTPUT_BUDGET.brief * 4 + 2000);
  const brief = text(long).content[0]!.text;
  assert.ok(estimateTokens(brief) <= OUTPUT_BUDGET.brief);
  assert.match(brief, /use mode:"full"/, "brief keeps today's hint");
  const full = text(long, "full").content[0]!.text;
  assert.equal(full, long, "full ceiling leaves a text under it whole");
  const capped = text(long, { maxTokens: 400 }).content[0]!.text;
  assert.ok(estimateTokens(capped) <= 400);
});

// Covers: req~find-response-budget~1
test("budgetExploreShape keeps a 172-line source whole in full mode and never hints mode:full there", () => {
  const source = Array.from({ length: 172 }, (_, i) => `line ${i}`).join("\n");
  const value: Record<string, unknown> = { symbol: { source } };
  const truncated: { field: string; omitted: number; hint: string }[] = [];
  budgetExploreShape(value, "full", truncated);
  assert.equal((value.symbol as { source: string }).source, source);
  assert.equal(truncated.length, 0);

  const huge = Array.from({ length: 900 }, (_, i) => `line ${i}`).join("\n");
  const big: Record<string, unknown> = { symbol: { source: huge } };
  budgetExploreShape(big, "full", truncated);
  assert.equal(truncated.length, 1);
  assert.ok(!truncated[0].hint.includes('mode:"full"'), truncated[0].hint);
});
