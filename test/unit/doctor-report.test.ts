import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { sampleProfile } from "../helpers/fixtures.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import {
  doctor,
  worstStatus,
  type CheckStatus,
  type DoctorReport,
} from "../../src/modules/foundation/doctor.js";

const FROZEN_IDS = [
  "env.node",
  "env.platform",
  "env.git",
  "env.ast-engine",
  "cfg.manifest",
  "cfg.ownership",
  "cfg.symlinks",
  "cfg.hooks",
  "cfg.laws",
  "cfg.budget",
  "cfg.tool-surface",
  "cfg.index.freshness",
  "cfg.specs.orphans",
  "auth.none",
  "conn.registry",
  "conn.egress",
  "notes.compact",
  "notes.capabilities",
] as const;

test("worstStatus ranks error above warn above ok above skip", () => {
  assert.equal(worstStatus(["skip", "ok", "warn"]), "warn");
  assert.equal(worstStatus(["ok", "error", "warn"] as CheckStatus[]), "error");
});

test("doctor --json shape: schemaVersion, five sections, overall status", async (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  const report = await doctor(root, { offline: true, redact: true });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.sections.length, 5);
  assert.deepEqual(
    report.sections.map((s) => s.id),
    ["environment", "configuration", "authentication", "connectivity", "notes"],
  );
  assert.equal(report.status, worstStatus(report.sections.map((s) => s.status)));
  assert.equal(report.redacted, true);
});

test("warn and error checks carry a remedy", async (t) => {
  const root = tmpRepo(t);
  const report = await doctor(root, { offline: true });
  for (const section of report.sections) {
    for (const c of section.checks) {
      if (c.status === "warn" || c.status === "error") {
        assert.ok(c.remedy && c.remedy.length > 0, `${c.id} missing remedy`);
      }
    }
  }
});

test("uninitialised project still reports environment; configuration is skip", async (t) => {
  const root = tmpRepo(t);
  const report = await doctor(root, { offline: true });
  const env = report.sections.find((s) => s.id === "environment")!;
  assert.ok(env.checks.some((c) => c.id === "env.node"));
  const cfg = report.sections.find((s) => s.id === "configuration")!;
  assert.ok(cfg.checks.every((c) => c.status === "skip"));
});

test("auth.none is ok and local-only", async (t) => {
  const root = tmpRepo(t);
  const report = await doctor(root, { offline: true });
  const auth = report.sections
    .find((s) => s.id === "authentication")!
    .checks.find((c) => c.id === "auth.none")!;
  assert.equal(auth.status, "ok");
  assert.match(auth.detail ?? "", /no credentials|fully local/i);
});

test("offline skips registry check", async (t) => {
  const root = tmpRepo(t);
  const report = await doctor(root, { offline: true });
  const reg = report.sections
    .find((s) => s.id === "connectivity")!
    .checks.find((c) => c.id === "conn.registry")!;
  assert.equal(reg.status, "skip");
});

test("redaction removes home path by default", async (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  // Force a path into a check by planting a broken symlink detail via broken link.
  const link = path.join(root, ".claude", "skills");
  fs.rmSync(link, { force: true });
  fs.symlinkSync(path.join(os.homedir(), "gone-target"), link);
  const report = await doctor(root, { offline: true, redact: true });
  const blob = JSON.stringify(report);
  assert.equal(blob.includes(os.homedir()), false);
  assert.equal(report.redacted, true);
});

test("frozen check ids remain available in an initialised report", async (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  const report = await doctor(root, { offline: true });
  const ids = new Set(report.sections.flatMap((s) => s.checks.map((c) => c.id)));
  for (const id of FROZEN_IDS) {
    if (id.startsWith("cfg.mcp.")) continue;
    assert.ok(ids.has(id), `missing frozen id ${id}`);
  }
});

test("DoctorReport validates against published JSON Schema shape (required keys)", async (t) => {
  const root = tmpRepo(t);
  const report: DoctorReport = await doctor(root, { offline: true });
  const schemaPath = path.join(process.cwd(), "docs/schemas/doctor-report-v1.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as {
    required: string[];
  };
  for (const key of schema.required) {
    assert.ok(key in report, `missing ${key}`);
  }
});
