import { test } from "node:test";
import assert from "node:assert/strict";
import { toMarkdown } from "../../src/modules/foundation/report-md.js";
import type { Finding, VerifyReport } from "../../src/modules/foundation/verify.js";

const report = (over: Partial<VerifyReport> = {}): VerifyReport => ({
  schemaVersion: 1,
  summary: { evaluated: 0, passed: 0, failed: 0, skipped: 0, unknown: 0 },
  findings: [],
  skipped: [],
  unknown: [],
  elapsedMs: 0,
  ...over,
});

test("toMarkdown lists findings with file and line", () => {
  const finding: Finding = {
    lawId: "law~x~1",
    severity: "error",
    engine: "deps",
    file: "src/a.ts",
    line: 9,
    message: "nope",
  };
  const md = toMarkdown(
    report({
      findings: [finding],
      summary: { evaluated: 1, passed: 0, failed: 1, skipped: 0, unknown: 0 },
    }),
  );
  assert.match(md, /law~x~1/);
  assert.match(md, /src\/a\.ts:9/);
  assert.match(md, /\*\*0\*\* passed/);
});

test("toMarkdown lists skipped laws and never claims coverage", () => {
  const md = toMarkdown(
    report({
      skipped: [{ lawId: "law~y~1", reason: "no-index", detail: "compass_index" }],
      summary: { evaluated: 0, passed: 0, failed: 0, skipped: 1, unknown: 0 },
    }),
  );
  assert.match(md, /law~y~1/);
  assert.match(md, /no-index/);
  assert.doesNotMatch(md, /cover(ed|age)/i);
  assert.doesNotMatch(md, /requirement is (met|satisfied)/i);
});
