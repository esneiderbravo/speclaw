import { test } from "node:test";
import assert from "node:assert/strict";
import { pkgName, pkgVersion } from "../../src/shared/version.js";

// prep-test-assets.mjs copies package.json to dist-test/package.json, so version
// resolves the real name/version from its compiled location.
test("pkgName returns the published package name", () => {
  assert.equal(pkgName(), "@esneiderbravo/speclaw");
});

test("pkgVersion returns a semver-shaped string", () => {
  assert.match(pkgVersion(), /^\d+\.\d+\.\d+/);
});

test("pkgVersion is cached (stable across calls)", () => {
  assert.equal(pkgVersion(), pkgVersion());
});
