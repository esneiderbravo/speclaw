import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, read, has } from "../helpers/env.js";
import { checkAction, clearLawCache } from "../../src/modules/foundation/check.js";
import { writeLawManifest, type Law } from "../../src/modules/foundation/laws.js";

const lawOf = (over: Partial<Law> = {}): Law => ({
  id: "law~x~1",
  title: "X",
  severity: "warn",
  scope: [],
  prose: "do x",
  verification: { kind: "path" },
  enforcement: "feedback",
  source: { file: "LAWS.md" },
  ...over,
});

function project(t: Parameters<typeof tmpRepo>[0], laws: Law[]): string {
  const root = tmpRepo(t);
  clearLawCache();
  writeLawManifest(root, { version: 1, laws });
  return root;
}

test("a blocking law denies a matching PreToolUse and cites id + prose + source", (t) => {
  const root = project(t, [
    lawOf({
      id: "law~no-secrets~1",
      scope: ["**/.env"],
      enforcement: "bloqueo",
      prose: "Never write .env",
      source: { file: "docs/standards/base-standards.md", line: 42 },
    }),
  ]);
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "deny");
  assert.match(r.reason ?? "", /law~no-secrets~1/);
  assert.match(r.reason ?? "", /Never write \.env/);
  assert.match(r.reason ?? "", /base-standards\.md:42/);
  assert.ok(typeof r.elapsedMs === "number");
});

test("an out-of-scope law is not evaluated", (t) => {
  const root = project(t, [lawOf({ id: "law~fe~1", scope: ["src/frontend/**"] })]);
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: "src/backend/api.ts" } },
  });
  assert.equal(r.evaluated.length, 0);
  assert.equal(r.verdict, "allow");
});

test("a feedback law allows but returns its message on PostToolUse", (t) => {
  const root = project(t, [
    lawOf({ id: "law~pkg~1", scope: ["package.json"], enforcement: "feedback" }),
  ]);
  const r = checkAction({
    projectPath: root,
    event: "PostToolUse",
    payload: { tool_input: { file_path: "package.json" } },
  });
  assert.equal(r.verdict, "allow");
  assert.match(r.reason ?? "", /law~pkg~1/);
  assert.equal(r.evaluated[0]?.passed, true);
});

test("a bloqueo law does not deny on PostToolUse (only PreToolUse blocks)", (t) => {
  const root = project(t, [lawOf({ scope: ["**/.env"], enforcement: "bloqueo" })]);
  const r = checkAction({
    projectPath: root,
    event: "PostToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "allow");
});

test("evaluator fails open when the manifest is missing", (t) => {
  const root = tmpRepo(t);
  clearLawCache();
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "allow");
  assert.match(r.diagnostic ?? "", /manifest/);
});

test("evaluator fails open when the manifest is corrupt", (t) => {
  const root = tmpRepo(t);
  clearLawCache();
  fs.mkdirSync(path.join(root, ".speclaw"), { recursive: true });
  fs.writeFileSync(path.join(root, ".speclaw", "laws-manifest.json"), "{ not json");
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "allow");
  assert.ok(r.diagnostic);
});

test("InstructionsLoaded appends the file's law ids to the context log", (t) => {
  const root = project(t, [
    lawOf({ id: "law~a~1", source: { file: "LAWS.md" } }),
    lawOf({ id: "law~b~1", source: { file: "LAWS.md" } }),
    lawOf({ id: "law~c~1", source: { file: "docs/other.md" } }),
  ]);
  const r = checkAction({
    projectPath: root,
    event: "InstructionsLoaded",
    payload: { file: "LAWS.md" },
  });
  assert.equal(r.verdict, "allow");
  assert.ok(has(root, ".speclaw/context-log.jsonl"));
  const log = read(root, ".speclaw/context-log.jsonl");
  assert.match(log, /law~a~1/);
  assert.match(log, /law~b~1/);
  assert.ok(!/law~c~1/.test(log)); // declared in a different file
});

test("PreToolUse p99 stays within the 15 ms budget with 50 laws", (t) => {
  const laws = Array.from({ length: 50 }, (_, i) =>
    lawOf({ id: `law~n${i}~1`, scope: [`src/mod${i}/**/*.{ts,tsx}`, "!src/gen/**"] }),
  );
  const root = project(t, laws);
  // Warm the compiled-glob cache, then measure the hot path.
  const payload = { tool_input: { file_path: "src/mod49/deep/a.ts" } };
  checkAction({ projectPath: root, event: "PreToolUse", payload });
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    const r = checkAction({ projectPath: root, event: "PreToolUse", payload });
    samples.push(r.elapsedMs);
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.99))]!;
  assert.ok(p99 < 15, `p99 was ${p99.toFixed(2)} ms (budget 15 ms)`);
});
