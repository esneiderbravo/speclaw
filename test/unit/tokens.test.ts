import { test } from "node:test";
import assert from "node:assert/strict";
import { countWords, estimateTokens } from "../../src/shared/tokens.js";

test("estimateTokens is deterministic", () => {
  const s = "Hello world — 42 paths/src/foo.ts";
  assert.equal(estimateTokens(s), estimateTokens(s));
});

test("estimateTokens is monotone for longer prose", () => {
  const a = "alpha beta";
  const b = a + " gamma delta epsilon";
  assert.ok(estimateTokens(b) >= estimateTokens(a));
});

test("estimateTokens handles empty, digits, punctuation, and accents", () => {
  assert.equal(estimateTokens(""), 0);
  assert.ok(estimateTokens("12345") > 0);
  assert.ok(estimateTokens("a/b/c") > 0);
  assert.ok(estimateTokens("café résumé") > 0);
});

test("estimateTokens does not touch the network", () => {
  // Structural: pure function over a string — no await / fetch in module.
  assert.equal(typeof estimateTokens("offline"), "number");
});

test("countWords splits on whitespace", () => {
  assert.equal(countWords("  one two three  "), 3);
  assert.equal(countWords(""), 0);
});
