import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { sampleProfile } from "../helpers/fixtures.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import { doctor } from "../../src/modules/foundation/doctor.js";

test("doctor reports an empty project as unhealthy with remediation hints", (t) => {
  const root = tmpRepo(t);
  const checks = doctor(root);
  const aiSpecs = checks.find((c) => c.name === "ai-specs directory")!;
  assert.equal(aiSpecs.ok, false);
  assert.match(aiSpecs.detail, /scaffold/);
  assert.ok(checks.some((c) => c.name === "agents" && !c.ok));
});

test("doctor passes the foundation and symlink checks after scaffold", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  const checks = doctor(root);

  const byName = (n: string) => checks.find((c) => c.name === n)!;
  assert.equal(byName("ai-specs directory").ok, true);
  assert.equal(byName("LAWS.md constitution").ok, true);
  assert.equal(byName("docs/standards/*").ok, true);
  assert.equal(byName(".claude/skills").ok, true);

  // lawbook + Compass index are not set up yet
  assert.equal(byName("lawbook workflow").ok, false);
  assert.equal(byName("Compass index").ok, false);
});

test("doctor flags a broken symlink", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  // Repoint .claude/skills at a nonexistent target while ai-specs/skills still
  // exists, so the check runs and sees a dangling link.
  const link = path.join(root, ".claude", "skills");
  fs.rmSync(link);
  fs.symlinkSync(path.join("..", "ai-specs", "gone"), link);

  const check = doctor(root).find((c) => c.name === ".claude/skills")!;
  assert.equal(check.ok, false);
  assert.match(check.detail, /broken symlink/);
});
