import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpRepo, read, has } from "../helpers/env.js";
import { sampleProfile } from "../helpers/fixtures.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import { doctor } from "../../src/modules/foundation/doctor.js";
import { checkAction, clearLawCache } from "../../src/modules/foundation/check.js";
import { readManifest } from "../../src/shared/manifest.js";

test("scaffold seeds the law manifest and installs Claude hooks", (t) => {
  const root = tmpRepo(t);
  const report = scaffold(root, sampleProfile(), [], ["claude"]);

  // the manifest is seeded from the shipped starter laws
  assert.ok(has(root, ".speclaw/laws-manifest.json"));
  assert.match(read(root, ".speclaw/laws-manifest.json"), /law~no-secrets-in-repo~1/);

  // hooks are merged into the agent's settings, keyed under `hooks`
  assert.ok(has(root, ".claude/settings.json"));
  const settings = JSON.parse(read(root, ".claude/settings.json"));
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].server, "speclaw");
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].tool, "speclaw_check");

  // the settings baseline is recorded so update/--backup can detect divergence
  const baselines = readManifest(root)!.baselines;
  assert.ok(Object.keys(baselines).some((k) => k.includes("settings.json")));

  // report surfaces which agents were hooked
  assert.deepEqual(report.hooks?.hooked, ["claude"]);
});

test("a curated manifest keeps existing entries on refresh and gains missing seed ids", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  const custom = {
    version: 1,
    laws: [
      {
        id: "law~no-secrets-in-repo~1",
        title: "CUSTOM",
        severity: "error",
        scope: ["**/.env"],
        prose: "keep this",
        verification: { kind: "path" },
        enforcement: "bloqueo",
        source: { file: "LAWS.md" },
      },
    ],
  };
  writeFileSync(join(root, ".speclaw", "laws-manifest.json"), JSON.stringify(custom) + "\n");
  scaffold(root, sampleProfile(), [], ["claude"], { refreshManaged: true });
  const after = JSON.parse(read(root, ".speclaw/laws-manifest.json")) as {
    laws: Array<{ id: string; title: string }>;
  };
  const kept = after.laws.find((l) => l.id === "law~no-secrets-in-repo~1");
  assert.equal(kept?.title, "CUSTOM", "existing entries are not overwritten");
  assert.ok(
    after.laws.some((l) => l.id === "law~shared-stays-inner~1"),
    "missing seed ids are appended",
  );
});

test("a real PreToolUse payload against the scaffolded manifest is blocked", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  clearLawCache();

  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    toolName: "Write",
    payload: { tool_name: "Write", tool_input: { file_path: "config/.env" } },
  });
  assert.equal(r.verdict, "deny");
  assert.match(r.reason ?? "", /law~no-secrets-in-repo~1/);
});

test("InstructionsLoaded end-to-end records coverage and doctor reports it", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]);
  clearLawCache();

  checkAction({ projectPath: root, event: "InstructionsLoaded", payload: { file: "LAWS.md" } });
  assert.ok(has(root, ".speclaw/context-log.jsonl"));

  const checks = doctor(root);
  const coverage = checks.find((c) => c.name === "law context coverage")!;
  assert.match(coverage.detail, /of \d+ laws loaded/);
  assert.match(coverage.detail, /after a compact/);

  const cursorless = checks.find((c) => c.name === "law manifest")!;
  assert.match(cursorless.detail, /law\(s\)/);
});

test("doctor flags an agent without hook support as asymmetric", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude", "cursor"]);
  const checks = doctor(root);
  const asym = checks.find((c) => c.name === "hook coverage across agents");
  assert.ok(asym, "expected an asymmetry check");
  assert.match(asym!.detail, /Cursor/);
  assert.match(asym!.detail, /speclaw verify/);
});
