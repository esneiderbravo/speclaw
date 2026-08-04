import { test } from "node:test";
import assert from "node:assert/strict";
import { text } from "../../src/shared/mcp.js";

test("text emits a string payload verbatim", () => {
  const result = text("hello");
  assert.deepEqual(result, { content: [{ type: "text", text: "hello" }] });
});

test("text pretty-prints a non-string payload as JSON", () => {
  const result = text({ a: 1, b: [2, 3] });
  assert.equal(result.content[0]!.type, "text");
  assert.equal(result.content[0]!.text, JSON.stringify({ a: 1, b: [2, 3] }, null, 2));
});

test("text serializes null as JSON", () => {
  assert.equal(text(null).content[0]!.text, "null");
});
