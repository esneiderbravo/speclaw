import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlags, list } from "../../src/cli/lib/args.js";

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
