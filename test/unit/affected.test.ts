import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { affectedTests, buildTestCommand } from "../../src/modules/compass/affected.js";
import { loadAffectedConfig } from "../../src/modules/compass/affected-config.js";
import { openDb } from "../../src/modules/compass/db.js";

test("buildTestCommand prefers package.json scripts.test", (t) => {
  const root = tmpRepo(t);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  const cfg = loadAffectedConfig(root);
  assert.equal(
    buildTestCommand(root, ["test/a.test.ts"], cfg, "subset"),
    "node --test test/a.test.ts",
  );
  assert.equal(buildTestCommand(root, [], cfg, "all"), "npm test");
});

test("affectedTests selects only reachable tests", async (t) => {
  const root = tmpRepo(t);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(
    root,
    "src/lib.ts",
    `export function add(a: number, b: number): number { return a + b; }\n`,
  );
  write(root, "src/other.ts", `export function noop(): void {}\n`);
  write(
    root,
    "src/lib.test.ts",
    `import { add } from "./lib.js";
export function testAdd(): number { return add(1, 2); }
`,
  );
  write(
    root,
    "src/other.test.ts",
    `import { noop } from "./other.js";
export function testNoop(): void { noop(); }
`,
  );
  // Extra unrelated tests
  for (let i = 0; i < 3; i++) {
    write(root, `src/extra${i}.test.ts`, `export function t${i}(): void {}\n`);
  }
  await buildIndex(root);

  const db = openDb(root);
  const tests = (
    db.prepare("SELECT path, is_test FROM files WHERE is_test = 1").all() as Array<{
      path: string;
      is_test: number;
    }>
  ).map((r) => r.path);
  db.close();
  assert.ok(tests.includes("src/lib.test.ts"));
  assert.equal(tests.length, 5);

  const res = affectedTests(root, { files: ["src/lib.ts"] });
  assert.equal(res.mode, "static");
  assert.deepEqual(
    res.tests.map((t) => t.file),
    ["src/lib.test.ts"],
  );
  assert.equal(res.skipped.files, 4);
  assert.match(res.command, /lib\.test\.ts/);
});

test("global lockfile selects full suite", async (t) => {
  const root = tmpRepo(t);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, "package-lock.json", "{}\n");
  write(root, "src/a.ts", `export function a(): void {}\n`);
  write(root, "src/a.test.ts", `export function t(): void {}\n`);
  await buildIndex(root);
  const res = affectedTests(root, { files: ["package-lock.json"] });
  assert.equal(res.mode, "all");
  assert.match(res.reason, /global/i);
  assert.equal(res.command, "npm test");
});

test("malformed config fails before selection", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", `export function a(): void {}\n`);
  await buildIndex(root);
  write(root, ".speclaw/affected.json", '{"version":99}');
  assert.throws(() => affectedTests(root, { files: ["src/a.ts"] }), /affected\.json/);
});
