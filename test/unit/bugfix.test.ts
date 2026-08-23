import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { artifactNeeds, readChangeType } from "../../src/modules/lawbook/levels.js";
import {
  scaffoldBugfix,
  validateBugfixContent,
  preventionRequiresDelta,
  inferBugResolution,
  parseBugfixSections,
} from "../../src/modules/lawbook/bugfix.js";
import { specInit, specValidate } from "../../src/modules/lawbook/engine.js";
import { tmpRepo } from "../helpers/env.js";

const VALID_BUG = `# Bugfix: dup

**Level:** 1 · **Type:** bug

## 1. Observed symptom
Duplicate charge error

## 2. Minimal reproduction
1. POST twice

## 3. Root cause
verifyCharge (src/billing/charge.ts:88)

## 4. Blast radius
billing module only

## 5. Proposed fix
Add idempotency key

## 6. Regression test
test/unit/billing.test.ts::no duplicate charges

## 7. Prevention
none: isolated off-by-one in handler
`;

test("artifactNeeds bug level 1 skips proposal and deltas", () => {
  const n = artifactNeeds(1, "bug");
  assert.equal(n.bugfix, true);
  assert.equal(n.proposal, false);
  assert.equal(n.deltaSpecs, false);
});

test("scaffoldBugfix creates bugfix.md not proposal", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const r = scaffoldBugfix(root, "dup-charge", { level: 1 });
  assert.ok(fs.existsSync(path.join(r.dir, "bugfix.md")));
  assert.ok(!fs.existsSync(path.join(r.dir, "proposal.md")));
  assert.equal(readChangeType(root, "dup-charge"), "bug");
});

test("validateBugfixContent rejects missing reproduction", () => {
  const bad = VALID_BUG.replace("1. POST twice", "");
  const issues = validateBugfixContent(1, bad);
  assert.ok(issues.some((i) => i.includes("§2") || i.includes("reproduction")));
});

test("preventionRequiresDelta detects missing requirement language", () => {
  const text = VALID_BUG.replace(
    "none: isolated",
    "A canonical requirement was missing from lawbook-workflow spec",
  );
  assert.equal(preventionRequiresDelta(text), true);
});

test("inferBugResolution mitigated for unreproducible", () => {
  const text = VALID_BUG.replace(
    "## 2. Minimal reproduction",
    "## 2. Minimal reproduction\nunreproducible: heisenbug in prod only",
  );
  assert.equal(inferBugResolution(text), "mitigated");
});

test("specValidate accepts bug level 1 with bugfix + tasks + report", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldBugfix(root, "b1", { level: 1 });
  fs.writeFileSync(path.join(root, "lawbook/changes/b1/bugfix.md"), VALID_BUG);
  fs.writeFileSync(path.join(root, "lawbook/changes/b1/reports/backend.md"), "# ok\n");
  const v = specValidate(root, "b1");
  assert.equal(v.valid, true, v.issues.join("; "));
});

test("parseBugfixSections extracts seven sections", () => {
  const m = parseBugfixSections(VALID_BUG);
  assert.ok(m.has("1. Observed symptom"));
  assert.ok(m.get("6. Regression test")!.includes("billing.test"));
});
