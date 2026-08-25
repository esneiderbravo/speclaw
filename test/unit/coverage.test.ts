import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpecItems } from "../../src/modules/lawbook/spec-items.js";
import {
  buildCoverageReport,
  coverageExitCode,
  loadCoverageConfig,
  matchGlob,
  proposeAdopt,
  refineSourceType,
} from "../../src/modules/lawbook/coverage.js";
import { tmpRepo, write } from "../helpers/env.js";

test("parseSpecItems reads ids, Needs, and inline links", () => {
  const items = parseSpecItems(
    "lawbook/specs/demo/spec.md",
    `# Demo

### Requirement: Hook generation \`req~hook-generation~1\`

Needs: impl, utest
Tags: hooks

#### Scenario: happy [@test test/unit/hooks.test.ts]
- Given x
- When y
- Then z
`,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.idText, "req~hook-generation~1");
  assert.equal(items[0]!.title, "Hook generation");
  assert.deepEqual(items[0]!.needs, ["impl", "utest"]);
  assert.equal(items[0]!.inlineLinks.length, 1);
  assert.equal(items[0]!.inlineLinks[0]!.targetPath, "test/unit/hooks.test.ts");
});

test("parseSpecItems leaves unidentified requirements without failing", () => {
  const items = parseSpecItems(
    "lawbook/specs/demo/spec.md",
    `### Requirement: No id yet\n\nThe system SHALL do a thing.\n`,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.id, null);
});

test("matchGlob handles ** and *", () => {
  assert.equal(matchGlob("src/foo/bar.ts", "src/**"), true);
  assert.equal(matchGlob("test/unit/a.test.ts", "test/unit/**"), true);
  assert.equal(matchGlob("test/a.test.ts", "test/**/*.test.ts"), true);
  assert.equal(matchGlob("docs/a.md", "src/**"), false);
});

test("buildCoverageReport reports missing coverage as direct defects", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "lawbook/specs/demo/spec.md",
    `### Requirement: Thing \`req~thing~1\`\n\nNeeds: impl, utest\n`,
  );
  const cfg = loadCoverageConfig(root);
  const report = buildCoverageReport(root, { cfg, now: "2026-01-01T00:00:00.000Z" });
  assert.equal(report.summary.identified, 1);
  assert.equal(report.items[0]!.shallow, false);
  assert.ok(report.items[0]!.uncoveredTypes.includes("impl"));
  assert.ok(report.items[0]!.uncoveredTypes.includes("utest"));
  assert.equal(coverageExitCode(report, cfg), 1);
});

test("buildCoverageReport exits 0 when nothing is identified", (t) => {
  const root = tmpRepo(t);
  write(root, "lawbook/specs/demo/spec.md", `### Requirement: Anonymous\n\nSHALL work.\n`);
  const cfg = loadCoverageConfig(root);
  const report = buildCoverageReport(root, { cfg });
  assert.equal(report.summary.identified, 0);
  assert.equal(coverageExitCode(report, cfg), 0);
});

test("proposeAdopt invents stable ids without writing", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "lawbook/specs/demo/spec.md",
    `### Requirement: Hook Generation\n\nSHALL emit hooks.\n`,
  );
  const proposals = proposeAdopt(root);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]!.proposedId, "req~hook-generation~1");
  assert.equal(proposals[0]!.collision, false);
});

// Covers: req~ptest-need~1, req~ptest-archive-gate~1, req~ears-cli-surface~1
test("Verification: property expands effective needs to include ptest", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "lawbook/specs/demo/spec.md",
    `### Requirement: Universal \`req~univ~1\`

Verification: property
Needs: impl

The system SHALL hold for any input.
`,
  );
  const cfg = loadCoverageConfig(root);
  const report = buildCoverageReport(root, { cfg });
  assert.ok(report.items[0]!.needs.includes("ptest"));
  assert.ok(report.items[0]!.uncoveredTypes.includes("ptest"));
});

test("refineSourceType promotes utest to ptest near fc.assert", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "test/unit/demo.test.ts",
    `// Covers: req~univ~1
import fc from "fast-check";
fc.assert(fc.property(fc.boolean(), (b) => b || !b));
`,
  );
  const cfg = loadCoverageConfig(root);
  const refined = refineSourceType(root, "test/unit/demo.test.ts", 1, "utest", cfg.propertyRunners);
  assert.equal(refined, "ptest");
});
