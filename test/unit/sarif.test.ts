import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SARIF_RESULT_CAP,
  toRepoRelativeUri,
  toSarif,
} from "../../src/modules/foundation/sarif.js";
import type { Law } from "../../src/modules/foundation/laws.js";
import type { Finding, VerifyReport } from "../../src/modules/foundation/verify.js";

const law = (id: string, over: Partial<Law> = {}): Law => ({
  id,
  title: id,
  severity: "error",
  scope: [],
  prose: `enforce ${id}`,
  verification: { kind: "deps", rule: { from: "^a", to: "^b" } },
  enforcement: "gate",
  source: { file: "docs/standards/architecture.md" },
  ...over,
});

const finding = (over: Partial<Finding> = {}): Finding => ({
  lawId: "law~a~1",
  severity: "error",
  engine: "deps",
  file: "src/a.ts",
  line: 4,
  message: "forbidden",
  ...over,
});

const report = (over: Partial<VerifyReport> = {}): VerifyReport => ({
  schemaVersion: 1,
  summary: { evaluated: 0, passed: 0, failed: 0, skipped: 0, unknown: 0 },
  findings: [],
  skipped: [],
  unknown: [],
  elapsedMs: 0,
  ...over,
});

test("toRepoRelativeUri strips drive letters, backslashes, and leading slashes", () => {
  assert.equal(toRepoRelativeUri("src/a.ts"), "src/a.ts");
  assert.equal(toRepoRelativeUri("/abs/src/a.ts"), "abs/src/a.ts");
  assert.equal(toRepoRelativeUri("C:\\src\\a.ts"), "src/a.ts");
});

test("toSarif emits SARIF 2.1.0 with one rule per loaded law", () => {
  const laws = [law("law~a~1", { title: "A", prose: "do a" }), law("law~b~1"), law("law~c~1")];
  const sarif = toSarif(
    report({ findings: [finding(), finding({ lawId: "law~b~1", file: "src/b.ts" })] }),
    { speclawVersion: "0.3.4", laws },
  );
  assert.equal(sarif.version, "2.1.0");
  const run = (sarif.runs as Array<Record<string, unknown>>)[0]!;
  const driver = (
    run.tool as {
      driver: {
        rules: Array<{
          id: string;
          shortDescription: { text: string };
          fullDescription: { text: string };
        }>;
      };
    }
  ).driver;
  assert.equal(driver.rules.length, 3);
  assert.equal(driver.rules[0]!.id, "law~a~1");
  assert.equal(driver.rules[0]!.shortDescription.text, "A");
  assert.equal(driver.rules[0]!.fullDescription.text, "do a");
});

test("SARIF locations are repository-relative and carry the local fingerprint", () => {
  const sarif = toSarif(report({ findings: [finding({ file: "/abs/src/a.ts" })] }), {
    speclawVersion: "0.3.4",
    laws: [law("law~a~1")],
  });
  const run = (sarif.runs as Array<Record<string, unknown>>)[0]!;
  const result = (run.results as Array<Record<string, unknown>>)[0]!;
  const uri = (
    result.locations as Array<{
      physicalLocation: { artifactLocation: { uri: string } };
    }>
  )[0]!.physicalLocation.artifactLocation.uri;
  assert.doesNotMatch(uri, /^[/\\]/);
  assert.doesNotMatch(uri, /^[A-Za-z]:/);
  assert.equal(
    (result.partialFingerprints as Record<string, string>)["speclaw/v1"],
    "law~a~1:/abs/src/a.ts:4",
  );
});

test("skipped laws become toolExecutionNotifications", () => {
  const sarif = toSarif(
    report({ skipped: [{ lawId: "law~a~1", reason: "no-index", detail: "build it" }] }),
    { speclawVersion: "0.3.4", laws: [law("law~a~1")] },
  );
  const run = (sarif.runs as Array<Record<string, unknown>>)[0]!;
  const notes = (
    run.invocations as Array<{ toolExecutionNotifications: Array<{ message: { text: string } }> }>
  )[0]!.toolExecutionNotifications;
  assert.match(notes[0]!.message.text, /law~a~1/);
  assert.match(notes[0]!.message.text, /no-index/);
});

test("findings above the SARIF cap are truncated by severity with a notification", () => {
  const findings: Finding[] = [];
  for (let i = 0; i < SARIF_RESULT_CAP + 3; i++) {
    findings.push(finding({ file: `src/f${i}.ts`, severity: i < 3 ? "info" : "error" }));
  }
  const sarif = toSarif(report({ findings }), { speclawVersion: "0.3.4", laws: [law("law~a~1")] });
  const run = (sarif.runs as Array<Record<string, unknown>>)[0]!;
  assert.equal((run.results as unknown[]).length, SARIF_RESULT_CAP);
  const notes = (
    run.invocations as Array<{ toolExecutionNotifications: Array<{ message: { text: string } }> }>
  )[0]!.toolExecutionNotifications;
  assert.ok(notes.some((n) => n.message.text.includes("Truncated 3")));
  const firstLevel = (run.results as Array<{ level: string }>)[0]!.level;
  assert.equal(firstLevel, "error");
});
