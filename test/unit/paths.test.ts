import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { assetsDir } from "../../src/shared/paths.js";

test("assetsDir resolves the assets/ directory next to a module file url", () => {
  const dir = assetsDir("file:///tmp/mod/register.js");
  assert.equal(dir, path.join("/tmp/mod", "assets"));
});

test("assetsDir handles a nested path", () => {
  const dir = assetsDir("file:///a/b/c/thing.js");
  assert.equal(dir, path.join("/a/b/c", "assets"));
});
