import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const cli = path.join(process.cwd(), "dist/cli/index.js");

function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

test("telemetry status reports absence of telemetry", () => {
  assert.ok(fs.existsSync(cli), "dist CLI must exist (npm test runs after build)");
  const res = run("telemetry", "status");
  assert.equal(res.status, 0);
  assert.match(res.stdout + res.stderr, /no telemetry/i);
});

test("telemetry enable fails", () => {
  assert.ok(fs.existsSync(cli));
  const res = run("telemetry", "enable");
  assert.notEqual(res.status, 0);
  assert.match(res.stdout + res.stderr, /unavailable|no telemetry/i);
});
