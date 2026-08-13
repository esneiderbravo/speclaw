import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, read, has } from "../helpers/env.js";
import {
  compileGlob,
  globError,
  hasBackend,
  matchesScope,
  readLawManifest,
  seedManifest,
  writeLawManifest,
  type Law,
} from "../../src/modules/foundation/laws.js";

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

test("compileGlob matches ** across segments, * within one", () => {
  assert.ok(compileGlob("src/**/*.ts").test("src/a/b/c.ts"));
  assert.ok(compileGlob("src/**/*.ts").test("src/a.ts"));
  assert.ok(!compileGlob("src/*.ts").test("src/a/b.ts"));
  assert.ok(compileGlob("**/.env").test("cfg/.env"));
  assert.ok(compileGlob("**/.env").test(".env"));
});

test("compileGlob supports braces and character classes", () => {
  assert.ok(compileGlob("src/**/*.{ts,tsx}").test("src/x.tsx"));
  assert.ok(compileGlob("file[0-9].ts").test("file3.ts"));
  assert.ok(!compileGlob("file[0-9].ts").test("fileA.ts"));
});

test("globError flags an unclosed bracket and a stray brace", () => {
  assert.match(globError("src/[abc.ts") ?? "", /unclosed '\['/);
  assert.match(globError("src/}.ts") ?? "", /unmatched '}'/);
  assert.equal(globError("src/**/*.ts"), null);
});

test("matchesScope OR-s positives and excludes negatives; empty = everywhere", () => {
  assert.ok(matchesScope([], "anything/at/all.ts"));
  assert.ok(matchesScope(["src/**", "!src/gen/**"], "src/app.ts"));
  assert.ok(!matchesScope(["src/**", "!src/gen/**"], "src/gen/out.ts"));
  assert.ok(!matchesScope(["src/**"], "docs/readme.md"));
});

test("hasBackend is true only for the implemented path backend", () => {
  assert.ok(hasBackend(lawOf({ verification: { kind: "path" } })));
  assert.ok(!hasBackend(lawOf({ verification: { kind: "deps" } })));
});

test("the shipped seed manifest is valid and path-only", () => {
  const seed = seedManifest();
  assert.ok(seed.laws.length >= 1);
  for (const l of seed.laws) assert.equal(l.verification.kind, "path");
  assert.ok(seed.laws.some((l) => l.enforcement === "bloqueo"));
});

test("write/read round-trips a manifest and validation rejects a bad law", (t) => {
  const root = tmpRepo(t);
  writeLawManifest(root, { version: 1, laws: [lawOf()] });
  assert.ok(has(root, ".speclaw/laws-manifest.json"));
  const back = readLawManifest(root);
  assert.equal(back?.laws[0]?.id, "law~x~1");
  assert.match(read(root, ".speclaw/laws-manifest.json"), /law~x~1/);

  assert.throws(() =>
    writeLawManifest(root, {
      version: 1,
      // @ts-expect-error — deliberately invalid enforcement value
      laws: [lawOf({ enforcement: "nope" })],
    }),
  );
});

test("readLawManifest returns null for a missing or corrupt manifest", (t) => {
  const root = tmpRepo(t);
  assert.equal(readLawManifest(root), null);
});
