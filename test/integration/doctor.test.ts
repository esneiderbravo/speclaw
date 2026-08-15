import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { sampleProfile } from "../helpers/fixtures.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import { doctor } from "../../src/modules/foundation/doctor.js";
import { writeLawManifest } from "../../src/modules/foundation/laws.js";

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

test("doctor reports graph-engine availability when deps/graph laws exist without an index", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  // Replace the seed manifest with one that declares a graph-reading law.
  writeLawManifest(root, {
    version: 1,
    laws: [
      {
        id: "law~no-domain-to-infra~1",
        title: "Domain must not depend on infra",
        severity: "error",
        scope: ["src/domain/**"],
        prose: "The domain must not depend on infrastructure.",
        verification: { kind: "deps", rule: { from: "^src/domain/", to: "^src/infra/" } },
        enforcement: "gate",
        source: { file: "docs/standards/architecture.md" },
      },
    ],
  });
  const check = doctor(root).find((c) => c.name === "graph law engines")!;
  assert.ok(check);
  assert.equal(check.ok, false); // no index built yet
  assert.match(check.detail, /skipped|compass_index/);
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
