import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlags, list, repeated, REPEATABLE_FLAGS } from "../../src/cli/lib/args.js";

test("parseFlags reads --key value, --key=value, --bool, -x, and positionals", () => {
  const flags = parseFlags(["init", "--path", "/tmp/x", "--name=demo", "--force", "-v", "pos"]);
  assert.deepEqual(flags._, ["init", "pos"]);
  assert.equal(flags.path, "/tmp/x");
  assert.equal(flags.name, "demo");
  assert.equal(flags.force, true);
  assert.equal(flags.v, true);
});

test("parseFlags treats a trailing --flag before another flag as boolean", () => {
  const flags = parseFlags(["--a", "--b", "val"]);
  assert.equal(flags.a, true);
  assert.equal(flags.b, "val");
});

test("parseFlags treats a --flag at end of argv as boolean", () => {
  const flags = parseFlags(["--only"]);
  assert.equal(flags.only, true);
});

// Covers: req~harness-state~1
test("parseFlags collects a repeated repeatable flag into an array without splitting commas", () => {
  const flags = parseFlags(
    ["--question", "a", "--question=b, c", "--path", "/one", "--path", "/two"],
    ["question"],
  );
  assert.deepEqual(flags.question, ["a", "b, c"]);
  assert.equal(flags.path, "/two");
  assert.deepEqual(parseFlags(["--question", "x"], ["question"]).question, ["x"]);
  assert.equal(parseFlags(["--question", "x"]).question, "x");
});

// Covers: req~harness-state~1
test("a bare repeatable flag neither adds nor drops values, and repeated() never splits commas", () => {
  assert.deepEqual(REPEATABLE_FLAGS, ["question"]);
  const after = parseFlags(["--question", "a", "--question"], REPEATABLE_FLAGS);
  assert.deepEqual(after.question, ["a"]);
  const before = parseFlags(["--question", "--question", "b"], REPEATABLE_FLAGS);
  assert.deepEqual(before.question, ["b"]);
  assert.equal(parseFlags(["--question"], REPEATABLE_FLAGS).question, true);
  assert.deepEqual(repeated(["a", "b, c"]), ["a", "b, c"]);
  assert.deepEqual(repeated("b, c"), ["b, c"]);
  assert.deepEqual(repeated(true), []);
  assert.deepEqual(repeated(undefined), []);
});

test("list splits comma-separated strings and trims", () => {
  assert.deepEqual(list("a, b ,c"), ["a", "b", "c"]);
});

test("list passes an array through", () => {
  assert.deepEqual(list(["x", "y"]), ["x", "y"]);
});

test("list returns empty for a boolean or undefined value", () => {
  assert.deepEqual(list(true), []);
  assert.deepEqual(list(undefined), []);
});
