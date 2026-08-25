import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpRepo, write, has } from "../helpers/env.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import { sampleProfile } from "../helpers/fixtures.js";
import { refreshLockfile } from "../../src/modules/foundation/lock.js";
import { verifyIntegrity } from "../../src/modules/foundation/integrity.js";
import { doctor } from "../../src/modules/foundation/doctor.js";

// Covers: req~lock-refresh-update~1, req~doctor-integrity~1, req~laws-integrity-cli~1
const cli = () => path.join(process.cwd(), "dist", "cli", "index.js");

test("scaffold creates speclaw.lock at root", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  assert.ok(has(root, "speclaw.lock"));
  const r = verifyIntegrity({ projectPath: root, checks: "integrity" });
  assert.equal(r.lockPresent, true);
  assert.ok(r.rootMatches);
});

test("speclaw laws lock and scan via CLI", (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "# ok\n");
  write(root, "CLAUDE.md", "# ok\n");
  const lock = spawnSync(process.execPath, [cli(), "laws", "lock", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(lock.status, 0, lock.stderr);
  assert.ok(has(root, "speclaw.lock"));
  const scan = spawnSync(process.execPath, [cli(), "laws", "scan", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(scan.status, 0, scan.stderr);
  const body = JSON.parse(scan.stdout);
  assert.ok(Array.isArray(body.findings));
});

test("doctor reports lock root status", async (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "x\n");
  refreshLockfile(root);
  const report = await doctor(root, { offline: true });
  const lock = report.sections.flatMap((s) => s.checks).find((c) => c.id === "cfg.integrity.lock");
  assert.ok(lock);
  assert.equal(lock!.status, "ok");
});

test("doctor reports external imports and outside-pipeline paths", async (t) => {
  const root = tmpRepo(t);
  write(root, "CLAUDE.md", "# X\n@~/outside/rules.md\n");
  write(root, "AGENTS.md", "ok\n");
  write(root, ".clinerules", "extra\n");
  refreshLockfile(root);
  const report = await doctor(root, { offline: true });
  const byId = (id: string) => report.sections.flatMap((s) => s.checks).find((c) => c.id === id)!;
  assert.equal(byId("cfg.integrity.lock").status, "ok");
  assert.equal(byId("cfg.integrity.imports").status, "warn");
  assert.match(byId("cfg.integrity.imports").detail ?? "", /CLAUDE\.md/);
  assert.equal(byId("cfg.integrity.outside-pipeline").status, "ok");
  assert.ok(Number(byId("cfg.integrity.outside-pipeline").value) >= 1);
});
