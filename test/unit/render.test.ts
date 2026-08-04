import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../../src/shared/render.js";

test("render substitutes known placeholders", () => {
  const { output, unresolved } = render("Hello {{name}} from {{org}}", {
    name: "Ada",
    org: "Speclaw",
  });
  assert.equal(output, "Hello Ada from Speclaw");
  assert.equal(unresolved.size, 0);
});

test("render leaves unknown placeholders untouched and reports them", () => {
  const { output, unresolved } = render("{{a}} and {{b}}", { a: "x" });
  assert.equal(output, "x and {{b}}");
  assert.deepEqual([...unresolved], ["b"]);
});

test("render treats an undefined value as unresolved", () => {
  const { output, unresolved } = render("{{k}}", { k: undefined });
  assert.equal(output, "{{k}}");
  assert.ok(unresolved.has("k"));
});

test("render replaces every occurrence of a placeholder", () => {
  const { output } = render("{{x}}-{{x}}", { x: "9" });
  assert.equal(output, "9-9");
});

test("render leaves text without placeholders unchanged", () => {
  const { output, unresolved } = render("plain text", {});
  assert.equal(output, "plain text");
  assert.equal(unresolved.size, 0);
});
