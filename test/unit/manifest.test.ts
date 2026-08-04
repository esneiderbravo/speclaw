import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, has } from "../helpers/env.js";
import { readManifest, writeManifest } from "../../src/shared/manifest.js";

test("readManifest returns null when a project has none", (t) => {
  const root = tmpRepo(t);
  assert.equal(readManifest(root), null);
});

test("writeManifest creates ai-specs/.speclaw.json with version, packs, baselines", (t) => {
  const root = tmpRepo(t);
  writeManifest(root, "1.2.3", ["agents"], { "CLAUDE.md": "abc" });
  assert.ok(has(root, "ai-specs/.speclaw.json"));
  const m = readManifest(root)!;
  assert.equal(m.version, "1.2.3");
  assert.deepEqual(m.packs, ["agents"]);
  assert.equal(m.baselines["CLAUDE.md"], "abc");
});

test("writeManifest unions packs and merges baselines across runs", (t) => {
  const root = tmpRepo(t);
  writeManifest(root, "1.0.0", ["agents"], { a: "1" });
  writeManifest(root, "1.1.0", ["agents", "quality"], { b: "2" });
  const m = readManifest(root)!;
  assert.equal(m.version, "1.1.0");
  assert.deepEqual(m.packs.sort(), ["agents", "quality"]);
  assert.deepEqual(m.baselines, { a: "1", b: "2" });
});

test("readManifest tolerates a malformed manifest by returning null", (t) => {
  const root = tmpRepo(t);
  writeManifest(root, "1.0.0", []);
  // corrupt it
  fs.writeFileSync(path.join(root, "ai-specs", ".speclaw.json"), "{ not json");
  assert.equal(readManifest(root), null);
});

test("readManifest coerces missing fields to safe defaults", (t) => {
  const root = tmpRepo(t);
  fs.mkdirSync(path.join(root, "ai-specs"), { recursive: true });
  fs.writeFileSync(path.join(root, "ai-specs", ".speclaw.json"), "{}");
  const m = readManifest(root)!;
  assert.equal(m.version, "0.0.0");
  assert.deepEqual(m.packs, []);
  assert.deepEqual(m.baselines, {});
});
