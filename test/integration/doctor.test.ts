import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { sampleProfile } from "../helpers/fixtures.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import { doctor } from "../../src/modules/foundation/doctor.js";
import { writeLawManifest } from "../../src/modules/foundation/laws.js";

test("doctor reports an empty project with skip configuration and remediation", async (t) => {
  const root = tmpRepo(t);
  const report = await doctor(root, { offline: true });
  const cfg = report.sections.find((s) => s.id === "configuration")!;
  assert.ok(cfg.checks.every((c) => c.status === "skip"));
  assert.ok(cfg.checks.every((c) => c.remedy?.includes("speclaw init")));
  assert.equal(report.schemaVersion, 1);
});

test("doctor passes symlink check after scaffold", async (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  const report = await doctor(root, { offline: true });
  const byId = (id: string) => report.sections.flatMap((s) => s.checks).find((c) => c.id === id)!;

  assert.equal(byId("cfg.manifest").status, "ok");
  assert.equal(byId("cfg.symlinks").status, "ok");
  assert.equal(byId("auth.none").status, "ok");
});

test("doctor reports laws when deps/graph laws exist without an index", async (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
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
  const report = await doctor(root, { offline: true });
  const laws = report.sections.flatMap((s) => s.checks).find((c) => c.id === "cfg.laws")!;
  assert.equal(laws.status, "ok");
  assert.match(laws.detail ?? "", /deps\/graph/);
  const fresh = report.sections
    .flatMap((s) => s.checks)
    .find((c) => c.id === "cfg.index.freshness")!;
  assert.ok(fresh.status === "warn" || fresh.status === "skip");
});

test("doctor flags a broken symlink as error with remedy", async (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  const link = path.join(root, ".claude", "skills");
  fs.rmSync(link);
  fs.symlinkSync(path.join("..", "ai-specs", "gone"), link);

  const report = await doctor(root, { offline: true });
  const check = report.sections.flatMap((s) => s.checks).find((c) => c.id === "cfg.symlinks")!;
  assert.equal(check.status, "error");
  assert.match(check.detail ?? "", /broken/i);
  assert.equal(check.remedy, "speclaw update");
});

test("unconfigured mcp is distinguished from configured", async (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  // Remove MCP registration for claude.
  fs.rmSync(path.join(root, ".mcp.json"), { force: true });
  const report = await doctor(root, { offline: true });
  const mcp = report.sections.flatMap((s) => s.checks).find((c) => c.id === "cfg.mcp.claude");
  assert.ok(mcp);
  assert.equal(mcp!.status, "warn");
  assert.match(mcp!.detail ?? "", /not configured/i);
  assert.notEqual(mcp!.status, "error");
});
