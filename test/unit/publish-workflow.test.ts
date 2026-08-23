import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("publish.yml requests OIDC and has no long-lived npm token", () => {
  const yml = fs.readFileSync(path.join(process.cwd(), ".github/workflows/publish.yml"), "utf8");
  assert.match(yml, /id-token:\s*write/);
  assert.doesNotMatch(yml, /NODE_AUTH_TOKEN/);
  assert.doesNotMatch(yml, /NPM_TOKEN/);
  assert.doesNotMatch(yml, /secrets\.NPM_TOKEN/);
});

test("publish.yml runs check and test before publish", () => {
  const yml = fs.readFileSync(path.join(process.cwd(), ".github/workflows/publish.yml"), "utf8");
  const checkAt = yml.indexOf("npm run check");
  const testAt = yml.indexOf("npm test");
  const publishAt = yml.indexOf("npm publish");
  assert.ok(checkAt > 0 && testAt > 0 && publishAt > 0);
  assert.ok(checkAt < publishAt, "check must precede publish");
  assert.ok(testAt < publishAt, "test must precede publish");
});
