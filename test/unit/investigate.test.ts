import { test } from "node:test";
import assert from "node:assert/strict";
import { investigate, formatInvestigateResult } from "../../src/modules/lawbook/investigate.js";
import { tmpRepo } from "../helpers/env.js";

test("investigate requires stackTrace or symptom", async () => {
  await assert.rejects(
    () => investigate({ projectPath: process.cwd() }),
    /provide stackTrace or symptom/,
  );
});

test("investigate without index degrades no-index", async (t) => {
  const root = tmpRepo(t);
  const r = await investigate({ projectPath: root, symptom: "duplicate charge" });
  assert.deepEqual(r.suspects, []);
  assert.ok(r.degraded.includes("no-index"));
});

test("investigate is deterministic for identical input", async (t) => {
  const root = tmpRepo(t);
  const args = {
    projectPath: root,
    stackTrace: "Error: x\n    at foo (src/a.ts:1:1)\n",
    maxSuspects: 5,
  };
  const a = formatInvestigateResult(await investigate(args));
  const b = formatInvestigateResult(await investigate(args));
  assert.equal(a, b);
});

test("investigate rejects unsupported language traces", async (t) => {
  const root = tmpRepo(t);
  const r = await investigate({
    projectPath: root,
    stackTrace: "at com.foo.Bar.baz(Bar.java:99)",
  });
  assert.equal(r.suspects.length, 0);
  assert.ok(r.guidance.includes("TS/JS/Python"));
});
