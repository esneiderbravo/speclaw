import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CONSUMER = path.join(
  ROOT,
  "src",
  "modules",
  "foundation",
  "assets",
  "workflows",
  "speclaw.yml",
);
const ACTION = path.join(ROOT, "action.yml");
const DOGFOOD = path.join(ROOT, ".github", "workflows", "speclaw.yml");

test("the consumer workflow template has no pull_request_target and empty default permissions", () => {
  const yml = readFileSync(CONSUMER, "utf8");
  assert.doesNotMatch(yml, /pull_request_target/);
  assert.match(yml, /^permissions:\s*\{\}\s*$/m);
  assert.match(yml, /fetch-depth:\s*0/);
  assert.match(yml, /contents:\s*read/);
  assert.match(yml, /security-events:\s*write/);
  assert.match(yml, /uses:\s*esneiderbravo\/speclaw@v1/);
  assert.match(yml, /codeql-action\/upload-sarif@v4/);
  assert.match(yml, /^name:\s*⚖️ speclaw\s*$/m);
  assert.match(yml, /name:\s*⚖️ Verify laws/);
});

test("action.yml runs Node 24, indexes, then verifies with --ci and --strict-engines", () => {
  const yml = readFileSync(ACTION, "utf8");
  assert.match(yml, /node-version:\s*"24"/);
  assert.match(yml, /\bindex\b/);
  assert.match(yml, /verify --ci/);
  assert.match(yml, /--strict-engines/);
  assert.match(yml, /--sarif/);
});

test("the dogfood workflow verifies this checkout via dist/, not npx of a published release", () => {
  const yml = readFileSync(DOGFOOD, "utf8");
  assert.match(yml, /npm ci/);
  assert.match(yml, /npm run build/);
  assert.match(yml, /node dist\/cli\/index\.js index/);
  assert.match(yml, /node dist\/cli\/index\.js verify --ci/);
  assert.doesNotMatch(yml, /npx .*@esneiderbravo\/speclaw/);
  assert.doesNotMatch(yml, /pull_request_target/);
  assert.match(yml, /fetch-depth:\s*0/);
  assert.match(yml, /codeql-action\/upload-sarif@v4/);
  assert.match(yml, /^name:\s*⚖️ speclaw\s*$/m);
  assert.match(yml, /🧭 Index/);
  assert.match(yml, /⚖️ Verify/);
});
