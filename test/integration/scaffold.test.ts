import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { sampleProfile } from "../helpers/fixtures.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import { readLawManifest, writeLawManifest } from "../../src/modules/foundation/laws.js";
import { loadPacks } from "../../src/modules/tools/packs.js";
import { readManifest } from "../../src/shared/manifest.js";

// Covers: req~ai-specs-gitignore~1, req~agent-ide-committable~1
test("scaffold writes the foundation, the workflow, gitignore, manifest, and agent wiring", (t) => {
  const root = tmpRepo(t);
  const report = scaffold(root, sampleProfile(), [], ["claude"]);

  // foundation (personalized templates, .template.md -> .md)
  assert.ok(has(root, "LAWS.md"));
  assert.ok(has(root, "CLAUDE.md"));
  assert.ok(has(root, "AGENTS.md"));
  assert.ok(has(root, "docs/compass.md"));
  assert.ok(has(root, "docs/standards/testing-standards.md"));
  assert.match(read(root, "CLAUDE.md"), /demo/, "project_name rendered into templates");

  // workflow (managed) + gitignore
  assert.ok(has(root, "ai-specs/skills"));
  assert.ok(has(root, "ai-specs/commands/lawbook"));
  assert.match(read(root, ".gitignore"), /\.speclaw\//);
  assert.match(read(root, ".gitignore"), /\*\.bak/);
  // ai-specs/ is local, regenerable content — never committed
  assert.ok(
    read(root, ".gitignore")
      .split(/\r?\n/)
      .some((l) => l.trim() === "ai-specs/"),
    "ai-specs/ is gitignored",
  );

  // agent wiring + manifest
  assert.ok(has(root, ".claude/skills"));
  assert.ok(has(root, ".mcp.json"));
  const manifest = readManifest(root)!;
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
  assert.ok(report.nextSteps.length > 0);
});

test("scaffold installs role agents without any tool pack", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["cursor"]);
  assert.ok(has(root, "ai-specs/agents/explorer.md"));
  assert.ok(has(root, "ai-specs/agents/planner.md"));
  assert.ok(has(root, "ai-specs/agents/implementer.md"));
  assert.ok(has(root, "ai-specs/agents/reviewer.md"));
  assert.ok(has(root, "ai-specs/agents/tester.md"));
  assert.ok(has(root, "ai-specs/agents/archiver.md"));
  assert.ok(has(root, ".cursor/agents"));
  assert.ok(has(root, "ai-specs/skills/cortex/SKILL.md"));
  assert.ok(has(root, "ai-specs/commands/lawbook/cortex.md"));
  assert.deepEqual(Object.keys(loadPacks()), []);
  // Cursor declares no hooks capability, so no settings file carries SessionStart
  assert.deepEqual(jsonFilesMentioning(root, "SessionStart"), []);
});

/** Relative paths of the JSON files under `root` whose text contains `needle`. */
function jsonFilesMentioning(root: string, needle: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory() && !e.isSymbolicLink()) walk(abs);
      else if (e.isFile() && e.name.endsWith(".json") && readFileSync(abs, "utf8").includes(needle))
        hits.push(relative(root, abs));
    }
  };
  walk(root);
  return hits;
}

test("scaffold throws on an unknown pack", (t) => {
  const root = tmpRepo(t);
  assert.throws(() => scaffold(root, sampleProfile(), ["nope"], []), /Unknown packs/);
});

test("scaffold is additive by default — a second run keeps existing personalized files", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], []);
  const report = scaffold(root, sampleProfile({ project_name: "changed" }), [], []);
  assert.ok(report.skipped.some((p) => p.endsWith("LAWS.md")));
  assert.doesNotMatch(read(root, "CLAUDE.md"), /changed/, "personalized file not overwritten");
});

test("scaffold with refreshManaged rewrites a locally edited managed file", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], []);
  // Locally edit a managed file, then refresh: it diverged from the baseline, so
  // refreshManaged overwrites it and records the divergence.
  const managed = "ai-specs/skills/draft/SKILL.md";
  assert.ok(has(root, managed));
  write(root, managed, "LOCALLY EDITED");
  const report = scaffold(root, sampleProfile(), [], [], { refreshManaged: true });
  assert.ok(
    report.refreshedDiverged.some((p) => p.endsWith("SKILL.md")),
    "the edited managed file is refreshed",
  );
  assert.doesNotMatch(read(root, managed), /LOCALLY EDITED/);
});

test("scaffold throws when the project path does not exist", () => {
  assert.throws(
    () => scaffold("/no/such/path/speclaw-xyz", sampleProfile(), [], []),
    /does not exist/,
  );
});

test("scaffold writes no CI workflow unless asked", (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], []);
  assert.ok(!has(root, ".github"));
});

test("scaffold ignores speclaw.lock and the agent folders it creates", (t) => {
  const root = tmpRepo(t);
  write(root, ".claude/settings.json", "{}\n");
  scaffold(root, sampleProfile(), [], ["agents", "claude"]);
  const lines = read(root, ".gitignore").split("\n");
  for (const entry of ["speclaw.lock", ".agents/", "ai-specs/", ".speclaw/"]) {
    assert.ok(lines.includes(entry), `${entry} is gitignored`);
  }
  assert.ok(!lines.includes(".claude/"), "a pre-existing agent folder is the user's");
});

test("scaffold seeds a cycle law scoped to apps/*/src on an apps-layout repo", (t) => {
  const root = tmpRepo(t);
  write(root, "apps/backend/src/main.ts", "export {};\n");
  scaffold(root, sampleProfile(), [], []);
  const back = readLawManifest(root)!;
  const cycle = back.laws.find((l) => l.id === "law~no-module-cycles~1");
  assert.ok(cycle);
  assert.ok(cycle!.scope.includes("apps/*/src/**"));
  assert.ok(!back.laws.some((l) => l.id === "law~compass-does-not-import-foundation~1"));
});

test("scaffold merges missing seed laws by id without overwriting curated entries", (t) => {
  const root = tmpRepo(t);
  writeLawManifest(root, {
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
  });
  scaffold(root, sampleProfile(), [], []);
  const back = readLawManifest(root)!;
  const kept = back.laws.find((l) => l.id === "law~no-secrets-in-repo~1");
  assert.equal(kept?.title, "CUSTOM");
  assert.equal(kept?.prose, "keep this");
  assert.ok(
    !back.laws.some((l) => l.id === "law~shared-stays-inner~1"),
    "dogfood laws are not appended when the tree does not host them",
  );
});
