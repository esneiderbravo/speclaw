import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { impact } from "../../src/modules/compass/query.js";
import { openDb } from "../../src/modules/compass/db.js";
import {
  matchGlob,
  loadAffectedConfig,
  isTestPath,
  inferModule,
} from "../../src/modules/compass/affected-config.js";

test("matchGlob supports braces and stars", () => {
  assert.equal(matchGlob("tsconfig.json", "tsconfig*.json"), true);
  assert.equal(matchGlob("src/foo.test.ts", "**/*.{test,spec}.ts"), true);
  assert.equal(matchGlob("src/foo.ts", "**/*.{test,spec}.ts"), false);
});

test("defaults mark test paths and modules", () => {
  assert.equal(isTestPath("src/foo.test.ts"), true);
  assert.equal(isTestPath("test/unit/a.ts"), true);
  assert.equal(isTestPath("src/foo.ts"), false);
  assert.equal(inferModule("src/modules/compass/query.ts"), "src/modules");
});

test("missing affected.json loads defaults", (t) => {
  const root = tmpRepo(t);
  const cfg = loadAffectedConfig(root);
  assert.equal(cfg.version, 1);
  assert.ok(cfg.globalFiles.includes("package.json"));
});

test("invalid affected.json fails fast", (t) => {
  const root = tmpRepo(t);
  write(root, ".speclaw/affected.json", "{not-json");
  assert.throws(() => loadAffectedConfig(root), /\.speclaw\/affected\.json/);
});

test("impact prefers node id over colliding names", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/a.ts",
    `export function validate(): number { return 1; }
export function callerA(): number { return validate(); }
`,
  );
  write(
    root,
    "src/b.ts",
    `export function validate(): number { return 2; }
export function callerB(): number { return validate(); }
`,
  );
  await buildIndex(root);
  const db = openDb(root);
  const a = db
    .prepare(
      `SELECT n.id FROM nodes n JOIN files f ON f.id = n.file_id
       WHERE n.name = 'validate' AND f.path = 'src/a.ts'`,
    )
    .get() as { id: number };
  db.close();

  const onlyA = impact(root, { nodeId: a.id, format: "flat", edgeKinds: ["call"] });
  const names = (onlyA.nodes ?? []).map((n) => n.name);
  assert.ok(names.includes("callerA"));
  assert.ok(!names.includes("callerB"));
  assert.ok((onlyA.nodes ?? []).every((n) => n.resolution === "exact" || n.name === "callerA"));
});

test("impact finds import-only dependents", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function shared(): number { return 1; }\n`);
  write(
    root,
    "src/b.ts",
    `import { shared } from "./a.js";
export function wrapper(): number { return 0; }
`,
  );
  await buildIndex(root);
  const res = impact(root, { symbol: "shared", format: "flat" });
  const files = new Set((res.nodes ?? []).map((n) => n.file));
  assert.ok(files.has("src/b.ts"), `expected b.ts in ${[...files].join(",")}`);
});

test("impact with call-only omits pure importers", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function shared(): number { return 1; }\n`);
  write(
    root,
    "src/b.ts",
    `import { shared } from "./a.js";
export function wrapper(): number { return 0; }
`,
  );
  await buildIndex(root);
  const res = impact(root, { symbol: "shared", format: "flat", edgeKinds: ["call"] });
  assert.ok(!(res.nodes ?? []).some((n) => n.file === "src/b.ts"));
});

test("global file reports repo blast radius", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function x(): void {}\n`);
  write(root, "tsconfig.json", `{ "compilerOptions": {} }\n`);
  await buildIndex(root);
  const res = impact(root, { files: ["tsconfig.json"] });
  assert.equal(res.global?.blastRadius, "repo");
  assert.ok(res.global?.matched.length);
});

test("grouped impact caps module representatives", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/core.ts", `export function hub(): number { return 1; }\n`);
  for (let i = 0; i < 12; i++) {
    write(
      root,
      `src/m${i}.ts`,
      `import { hub } from "./core.js";\nexport function c${i}(): number { return hub(); }\n`,
    );
  }
  await buildIndex(root);
  const res = impact(root, { symbol: "hub", topModules: 8, topPerModule: 5 });
  assert.ok(res.totals.nodes >= 12);
  assert.ok(res.modules.length <= 8);
  for (const m of res.modules) assert.ok(m.top.length <= 5);
});

test("cyclic callers terminate", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/cycle.ts",
    `export function a(): number { return b(); }
export function b(): number { return a(); }
`,
  );
  await buildIndex(root);
  const res = impact(root, { symbol: "a", format: "flat", maxDepth: 6 });
  const ids = (res.nodes ?? []).map((n) => n.nodeId);
  assert.equal(ids.length, new Set(ids).size);
});
