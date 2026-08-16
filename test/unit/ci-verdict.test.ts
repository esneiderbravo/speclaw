import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, parseFailOn, verifyExitCode } from "../../src/modules/foundation/ci.js";
import type { Finding, VerifyReport } from "../../src/modules/foundation/verify.js";

const finding = (over: Partial<Finding> = {}): Finding => ({
  lawId: "law~x~1",
  severity: "error",
  engine: "deps",
  file: "src/a.ts",
  line: 3,
  message: "do not",
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

test("parseFailOn defaults to error and rejects unknown values", () => {
  assert.equal(parseFailOn(undefined), "error");
  assert.equal(parseFailOn(true), "error");
  assert.equal(parseFailOn("warn"), "warn");
  assert.equal(parseFailOn("info"), "info");
  assert.equal(parseFailOn("error"), "error");
  assert.equal(parseFailOn("fatal"), null);
});

test("fingerprint is lawId:file:line, with missing line as 0", () => {
  assert.equal(fingerprint(finding()), "law~x~1:src/a.ts:3");
  assert.equal(fingerprint(finding({ line: undefined })), "law~x~1:src/a.ts:0");
});

test("verifyExitCode is 1 when a finding meets the fail-on threshold", () => {
  const r = report({
    findings: [finding({ severity: "error" })],
    summary: { evaluated: 1, passed: 0, failed: 1, skipped: 0, unknown: 0 },
  });
  assert.equal(verifyExitCode(r, { failOn: "error", strictEngines: false }), 1);
});

test("verifyExitCode is 0 when findings sit below the fail-on threshold", () => {
  const r = report({ findings: [finding({ severity: "warn" })] });
  assert.equal(verifyExitCode(r, { failOn: "error", strictEngines: false }), 0);
  assert.equal(verifyExitCode(r, { failOn: "warn", strictEngines: false }), 1);
});

test("verifyExitCode is 4 only when strict-engines sees a skip and nothing fails", () => {
  const r = report({
    skipped: [{ lawId: "law~x~1", reason: "no-index" }],
    summary: { evaluated: 0, passed: 0, failed: 0, skipped: 1, unknown: 0 },
  });
  assert.equal(verifyExitCode(r, { failOn: "error", strictEngines: false }), 0);
  assert.equal(verifyExitCode(r, { failOn: "error", strictEngines: true }), 4);
});

test("a failing finding beats a skip: exit 1, not 4", () => {
  const r = report({
    findings: [finding()],
    skipped: [{ lawId: "law~y~1", reason: "no-index" }],
  });
  assert.equal(verifyExitCode(r, { failOn: "error", strictEngines: true }), 1);
});
