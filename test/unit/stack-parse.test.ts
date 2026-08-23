import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapDistToSrc,
  normalizeTracePath,
  parseStackTrace,
  frameSymbolName,
} from "../../src/modules/lawbook/stack-parse.js";

const ROOT = "/Users/proj/speclaw";

test("parseStackTrace: V8 named frame", () => {
  const trace = `Error: boom
    at verifyCharge (src/billing/charge.ts:88:12)
    at processTicks (node:internal/process/task_queues:95:5)`;
  const r = parseStackTrace(ROOT, trace);
  assert.equal(r.frames.length, 1);
  assert.equal(r.frames[0]!.file, "src/billing/charge.ts");
  assert.equal(r.frames[0]!.line, 88);
  assert.equal(r.frames[0]!.fn, "verifyCharge");
  assert.ok(r.unresolved.some((u) => u.reason === "external"));
});

test("parseStackTrace: V8 anonymous frame", () => {
  const trace = `Error: x\n    at src/foo.ts:10:5\n`;
  const r = parseStackTrace(ROOT, trace);
  assert.equal(r.frames[0]!.file, "src/foo.ts");
  assert.equal(r.frames[0]!.fn, "");
});

test("parseStackTrace: node_modules external", () => {
  const trace = `Error: x\n    at fail (node_modules/pkg/index.js:1:1)\n`;
  const r = parseStackTrace(ROOT, trace);
  assert.equal(r.frames.length, 0);
  assert.equal(r.unresolved[0]!.reason, "external");
});

test("parseStackTrace: Python order inverted to deepest-first", () => {
  const trace = `Traceback (most recent call last):
  File "src/a.py", line 10, in outer
  File "src/b.py", line 3, in inner
`;
  const r = parseStackTrace(ROOT, trace);
  assert.equal(r.format, "python");
  assert.equal(r.frames[0]!.file, "src/b.py");
  assert.equal(r.frames[1]!.file, "src/a.py");
});

test("mapDistToSrc maps dist to src by basename", () => {
  assert.equal(mapDistToSrc("dist/cli/index.js"), "src/index.ts");
});

test("normalizeTracePath strips project root", () => {
  assert.equal(normalizeTracePath(ROOT, `${ROOT}/src/x.ts`), "src/x.ts");
});

test("frameSymbolName extracts method from Class.method", () => {
  assert.equal(
    frameSymbolName({ fn: "Billing.verify", file: "f", line: 1, rawPath: "f" }),
    "verify",
  );
});

test("parseStackTrace: unknown format marks unparseable", () => {
  const r = parseStackTrace(ROOT, "at com.example.Foo.bar(Foo.java:42)");
  assert.equal(r.frames.length, 0);
  assert.ok(r.unresolved.length > 0);
});
