import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpRepo, write, read } from "../helpers/env.js";
import { refreshLockfile } from "../../src/modules/foundation/lock.js";
// Covers: req~laws-accept-human~1, req~laws-integrity-cli~1
import { acceptLockPath, isInteractiveTty } from "../../src/modules/foundation/integrity.js";
import { captureTools } from "../helpers/contracts.js";
import { registerFoundation } from "../../src/modules/foundation/register.js";
import { registerCompass } from "../../src/modules/compass/register.js";
import { registerSpec } from "../../src/modules/lawbook/register.js";
import { registerTools } from "../../src/modules/tools/register.js";

test("acceptLockPath records accepted audit entry", (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "a\n");
  refreshLockfile(root);
  write(root, "AGENTS.md", "b\n");
  const lock = acceptLockPath(root, "AGENTS.md", {
    by: "unit",
    note: "reviewed",
    at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(lock.accepted.length, 1);
  assert.equal(lock.accepted[0]!.by, "unit");
  assert.equal(lock.accepted[0]!.note, "reviewed");
  assert.equal(lock.files["AGENTS.md"]!.digest.startsWith("sha256:"), true);
});

test("isInteractiveTty mirrors process streams", () => {
  assert.equal(typeof isInteractiveTty(), "boolean");
});

test("CLI laws accept without TTY exits non-zero and leaves lock unchanged", (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "a\n");
  refreshLockfile(root);
  write(root, "AGENTS.md", "b\n");
  const before = read(root, "speclaw.lock");
  const cli = path.join(process.cwd(), "dist", "cli", "index.js");
  const r = spawnSync(process.execPath, [cli, "laws", "accept", "AGENTS.md"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.notEqual(r.status, 0);
  assert.equal(read(root, "speclaw.lock"), before);
  assert.match(`${r.stderr}${r.stdout}`, /TTY|interactive/i);
});

test("no MCP tool mutates speclaw.lock", () => {
  process.env.SPECLAW_NO_ALIASES = "1";
  const names = [
    ...captureTools(registerFoundation).keys(),
    ...captureTools(registerCompass).keys(),
    ...captureTools(registerSpec).keys(),
    ...captureTools(registerTools).keys(),
  ];
  delete process.env.SPECLAW_NO_ALIASES;
  for (const n of names) {
    assert.ok(!/lock|accept|integrity/i.test(n), `unexpected integrity-mutating tool ${n}`);
  }
});
