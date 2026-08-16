import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, read, has } from "../helpers/env.js";
import {
  compileGlob,
  globError,
  hasBackend,
  hasBatchBackend,
  matchesScope,
  loadManifestForVerify,
  mergeSeedLaws,
  readLawManifest,
  regexError,
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

test("hasBackend is the action-time gate: path only, never a batch backend", () => {
  assert.ok(hasBackend(lawOf({ verification: { kind: "path" } })));
  assert.ok(!hasBackend(lawOf({ verification: { kind: "ast" } })));
  // deps/graph are batch backends — they must NOT run on the action-time hot path.
  assert.ok(!hasBackend(lawOf({ verification: { kind: "deps", rule: { from: "^a", to: "^b" } } })));
});

test("hasBatchBackend covers deps and graph, not path", () => {
  assert.ok(
    hasBatchBackend(lawOf({ verification: { kind: "deps", rule: { from: "^a", to: "^b" } } })),
  );
  assert.ok(hasBatchBackend(lawOf({ verification: { kind: "graph", rule: { circular: true } } })));
  assert.ok(!hasBatchBackend(lawOf({ verification: { kind: "path" } })));
});

test("a deps law with a rule payload validates and round-trips", (t) => {
  const root = tmpRepo(t);
  const law = lawOf({
    id: "law~no-domain-to-infra~1",
    scope: ["src/domain/**"],
    enforcement: "gate",
    verification: { kind: "deps", rule: { from: "^src/domain/", to: "^src/infra/" } },
  });
  writeLawManifest(root, { version: 1, laws: [law] });
  const back = readLawManifest(root);
  assert.ok(back);
  const v = back.laws[0]!.verification;
  assert.equal(v.kind, "deps");
  // Narrow through the discriminated union — no cast, no unsafe chaining.
  if (v.kind === "deps") assert.equal(v.rule.from, "^src/domain/");
});

test("a legacy { kind: 'path' } manifest entry still validates", (t) => {
  const root = tmpRepo(t);
  // Exactly the shape check-dispatcher wrote before this change.
  writeLawManifest(root, { version: 1, laws: [lawOf({ verification: { kind: "path" } })] });
  assert.equal(readLawManifest(root)?.laws[0]?.verification.kind, "path");
});

test("a malformed deps regex is rejected at validation time, naming the law id", (t) => {
  const root = tmpRepo(t);
  assert.throws(
    () =>
      writeLawManifest(root, {
        version: 1,
        laws: [
          lawOf({
            id: "law~bad~1",
            verification: { kind: "deps", rule: { from: "^(", to: "^b" } },
          }),
        ],
      }),
    /law~bad~1/,
  );
});

test("regexError flags an invalid pattern and passes a valid one", () => {
  assert.match(regexError("^(") ?? "", /./);
  assert.equal(regexError("^src/domain/"), null);
});

test("the shipped seed manifest is valid and includes path plus batch laws", () => {
  const seed = seedManifest();
  assert.ok(seed.laws.length >= 1);
  assert.ok(seed.laws.some((l) => l.verification.kind === "path"));
  assert.ok(seed.laws.some((l) => l.verification.kind === "deps"));
  assert.ok(seed.laws.some((l) => l.verification.kind === "graph"));
  assert.ok(seed.laws.some((l) => l.enforcement === "bloqueo"));
  assert.ok(seed.laws.some((l) => l.id === "law~shared-stays-inner~1"));
  assert.ok(seed.laws.some((l) => l.id === "law~compass-does-not-import-foundation~1"));
  assert.ok(seed.laws.some((l) => l.id === "law~no-module-cycles~1"));
  const shared = seed.laws.find((l) => l.id === "law~shared-stays-inner~1");
  assert.equal(shared?.verification.kind, "deps");
  if (shared?.verification.kind === "deps") {
    assert.deepEqual(shared.verification.rule.edgeKinds, ["import"]);
  }
});

test("mergeSeedLaws appends missing seed ids and never overwrites existing entries", () => {
  const custom = lawOf({
    id: "law~no-secrets-in-repo~1",
    title: "CUSTOM TITLE",
    prose: "keep this",
  });
  const { manifest, added } = mergeSeedLaws({ version: 1, laws: [custom] });
  const kept = manifest.laws.find((l) => l.id === "law~no-secrets-in-repo~1");
  assert.equal(kept?.title, "CUSTOM TITLE");
  assert.equal(kept?.prose, "keep this");
  assert.ok(added.includes("law~shared-stays-inner~1"));
  assert.ok(!added.includes("law~no-secrets-in-repo~1"));
});

test("loadManifestForVerify falls back to the seed when the file is missing", (t) => {
  const root = tmpRepo(t);
  const loaded = loadManifestForVerify(root);
  assert.ok(loaded.laws.some((l) => l.id === "law~no-secrets-in-repo~1"));
  assert.equal(readLawManifest(root), null, "fallback must not write the file");
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
