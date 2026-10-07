import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import {
  affectedTests,
  buildTestCommand,
  planTestCommand,
  type AffectedTestsResult,
} from "../../src/modules/compass/affected.js";
import { loadAffectedConfig } from "../../src/modules/compass/affected-config.js";
import { openDb } from "../../src/modules/compass/db.js";

/** The command contract of an affected-tests result, read structurally. */
interface CommandShape {
  command: string | null;
  commandReason?: string;
  commands?: Array<{ cwd: string; command: string; files: string[] }>;
}

function commandOf(res: AffectedTestsResult): CommandShape {
  return res as unknown as CommandShape;
}

/** A source module plus a declaration-less test that calls it inside a callback. */
function seedMath(root: string): void {
  write(
    root,
    "src/math.ts",
    `export function add(a: number, b: number): number { return a + b; }\n`,
  );
  write(
    root,
    "test/math.test.ts",
    `import { add } from "../src/math.js";
import { test } from "node:test";
test("adds", () => {
  add(1, 2);
  [1].push(2);
});
`,
  );
}

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

// Covers: req~affected-test-selection~1
// Realistic shapes: declaration-less tests, imports over several lines, and calls
// that sit inside `test(...)` callbacks.
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
    `import {
  add,
} from "./lib.js";
import { test } from "node:test";

test("adds", () => {
  add(1, 2);
});
`,
  );
  write(
    root,
    "src/other.test.ts",
    `import { noop } from "./other.js";
import { test } from "node:test";
test("noop", () => noop());
`,
  );
  // Extra unrelated tests
  for (let i = 0; i < 3; i++) {
    write(
      root,
      `src/extra${i}.test.ts`,
      `import { test } from "node:test";\ntest("t${i}", () => {});\n`,
    );
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
  assert.match(commandOf(res).command ?? "", /lib\.test\.ts/);
});

// Covers: req~impact-id-first~1
test("selects a declaration-less test file that calls the symbol inside a test callback", async (t) => {
  const root = tmpRepo(t);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  seedMath(root);
  await buildIndex(root);

  const res = affectedTests(root, { files: ["src/math.ts"] });
  assert.deepEqual(
    res.tests.map((x) => x.file),
    ["test/math.test.ts"],
  );
  const bySymbol = affectedTests(root, { symbols: ["add"] });
  assert.deepEqual(
    bySymbol.tests.map((x) => x.file),
    ["test/math.test.ts"],
  );
});

// Covers: req~import-resolution~1
test("selects a test file whose import spans several lines", async (t) => {
  const root = tmpRepo(t);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, "src/a.ts", `export function alpha(): number { return 1; }\n`);
  // Import-only dependent: the only link to src/a.ts is the multi-line import.
  write(
    root,
    "test/a.test.ts",
    `import {
  alpha,
  type Unused,
} from "../src/a.js";

export const ref = alpha;
export function check(): number { return 0; }
`,
  );
  await buildIndex(root);

  const res = affectedTests(root, { files: ["src/a.ts"] });
  assert.deepEqual(
    res.tests.map((x) => x.file),
    ["test/a.test.ts"],
  );
});

// Covers: req~import-resolution~1
test("resolves a tsconfig paths alias import", async (t) => {
  const root = tmpRepo(t);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(
    root,
    "apps/web/tsconfig.base.json",
    `{
  // JSON with comments and trailing commas, as tsc accepts.
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"], },
  },
}
`,
  );
  write(root, "apps/web/tsconfig.json", `{ "extends": "./tsconfig.base.json" }\n`);
  write(root, "apps/web/src/lib/x.ts", `export function x(): number { return 1; }\n`);
  write(
    root,
    "apps/web/test/x.test.ts",
    `import { x as renamed } from "@/lib/x";
export const ref = renamed;
export function check(): number { return 0; }
`,
  );
  // A malformed tsconfig elsewhere must not fail the run.
  write(root, "broken/tsconfig.json", `{ "compilerOptions": { "paths": `);
  write(root, "broken/src/b.ts", `export function b(): number { return 2; }\n`);
  write(root, "broken/test/b.test.ts", `import { b } from "../src/b.js";\nexport const r = b;\n`);
  await buildIndex(root);

  const res = affectedTests(root, { files: ["apps/web/src/lib/x.ts"] });
  assert.deepEqual(
    res.tests.map((x) => x.file),
    ["apps/web/test/x.test.ts"],
  );
  const broken = affectedTests(root, { files: ["broken/src/b.ts"] });
  assert.deepEqual(
    broken.tests.map((x) => x.file),
    ["broken/test/b.test.ts"],
  );
});

// Covers: req~affected-test-selection~1
test("mode none yields a null command with a reason", async (t) => {
  const root = tmpRepo(t);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  seedMath(root);
  write(root, "src/lonely.ts", `export function lonely(): number { return 0; }\n`);
  await buildIndex(root);

  const res = commandOf(affectedTests(root, { files: ["src/lonely.ts"] }));
  assert.equal(res.command, null);
  assert.match(res.commandReason ?? "", /no test file is reachable/i);
  assert.deepEqual(res.commands, []);
});

/** Root node --test, apps/web on vitest, packages/core on jest (devDependency only). */
function seedWorkspace(root: string): void {
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, "src/root.ts", `export function rootFn(): number { return 1; }\n`);
  write(
    root,
    "test/root.test.ts",
    `import { rootFn } from "../src/root.js";\nimport { test } from "node:test";\ntest("r", () => { rootFn(); });\n`,
  );
  write(root, "apps/web/package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  write(root, "apps/web/src/w.ts", `export function webFn(): number { return 2; }\n`);
  write(
    root,
    "apps/web/test/w.test.ts",
    `import { webFn } from "../src/w.js";\nimport { it } from "vitest";\nit("w", () => { webFn(); });\n`,
  );
  write(
    root,
    "packages/core/package.json",
    JSON.stringify({ devDependencies: { jest: "^29.0.0" } }),
  );
  write(root, "packages/core/src/c.ts", `export function coreFn(): number { return 3; }\n`);
  write(
    root,
    "packages/core/test/c.test.ts",
    `import { coreFn } from "../src/c.js";\ntest("c", () => { coreFn(); });\n`,
  );
}

// Covers: req~affected-test-selection~1
test("detects vitest, jest and node --test runners per package", async (t) => {
  const root = tmpRepo(t);
  seedWorkspace(root);
  await buildIndex(root);

  const web = commandOf(affectedTests(root, { files: ["apps/web/src/w.ts"] }));
  assert.deepEqual(web.commands, [
    { cwd: "apps/web", command: "npx vitest run test/w.test.ts", files: ["test/w.test.ts"] },
  ]);
  assert.equal(web.command, "cd apps/web && npx vitest run test/w.test.ts");

  const core = commandOf(affectedTests(root, { files: ["packages/core/src/c.ts"] }));
  assert.equal(core.commands?.[0]?.command, "npx jest --runTestsByPath test/c.test.ts");

  const rootRes = commandOf(affectedTests(root, { files: ["src/root.ts"] }));
  assert.deepEqual(rootRes.commands, [
    { cwd: ".", command: "node --test test/root.test.ts", files: ["test/root.test.ts"] },
  ]);
  assert.equal(rootRes.command, "node --test test/root.test.ts");
});

// Covers: req~affected-test-selection~1
test("groups a workspace-spanning selection into per-cwd commands", async (t) => {
  const root = tmpRepo(t);
  seedWorkspace(root);
  await buildIndex(root);

  const res = commandOf(
    affectedTests(root, { files: ["apps/web/src/w.ts", "packages/core/src/c.ts"] }),
  );
  assert.deepEqual(
    res.commands?.map((c) => c.cwd),
    ["apps/web", "packages/core"],
  );
  assert.equal(
    res.command,
    "(cd apps/web && npx vitest run test/w.test.ts) && " +
      "(cd packages/core && npx jest --runTestsByPath test/c.test.ts)",
  );
  assert.match(res.commandReason ?? "", /2 package/);
});

// Covers: req~affected-test-selection~1
test("maps compiled node --test globs and drops coverage thresholds", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "package.json",
    JSON.stringify({
      scripts: {
        pretest: "tsc -p tsconfig.test.json",
        test: "node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-lines=80 --test-coverage-exclude='dist-test/test/**' 'dist-test/test/**/*.test.js'",
      },
    }),
  );
  write(root, "src/a.ts", `export function alpha(): number { return 1; }\n`);
  write(
    root,
    "test/unit/a.test.ts",
    `import { alpha } from "../../src/a.js";\nimport { test } from "node:test";\ntest("a", () => { alpha(); });\n`,
  );
  await buildIndex(root);

  const res = commandOf(affectedTests(root, { files: ["src/a.ts"] }));
  assert.equal(
    res.command,
    "npm run pretest && node --test --test-concurrency=1 dist-test/test/unit/a.test.js",
  );
  assert.doesNotMatch(res.command ?? "", /coverage/);
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

// Covers: req~affected-test-selection~1
test("leaves out helpers the node --test glob never runs", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "package.json",
    JSON.stringify({
      scripts: { pretest: "tsc", test: "node --test 'dist-test/test/**/*.test.js'" },
    }),
  );
  write(root, "src/a.ts", `export function alpha(): number { return 1; }\n`);
  write(root, "src/b.ts", `export function beta(): number { return 2; }\n`);
  write(
    root,
    "test/helpers/fixtures.ts",
    `import { alpha } from "../../src/a.js";\nimport { beta } from "../../src/b.js";\nexport function seed(): number { return alpha() + beta(); }\n`,
  );
  write(
    root,
    "test/unit/a.test.ts",
    `import { alpha } from "../../src/a.js";\nimport { test } from "node:test";\ntest("a", () => { alpha(); });\n`,
  );
  await buildIndex(root);

  const both = commandOf(affectedTests(root, { files: ["src/a.ts"] }));
  assert.equal(both.command, "npm run pretest && node --test dist-test/test/unit/a.test.js");
  assert.deepEqual(both.commands?.[0]?.files, ["test/unit/a.test.ts"]);
  assert.match(both.commandReason ?? "", /1 helper file/);

  // Only the helper reaches src/b.ts: nothing the runner executes is selected.
  const helperOnly = commandOf(affectedTests(root, { files: ["src/b.ts"] }));
  assert.equal(helperOnly.command, null);
  assert.deepEqual(helperOnly.commands, []);
  assert.match(helperOnly.commandReason ?? "", /no runnable test file/);
});

// Covers: req~affected-test-selection~1
test("a leaf package inherits vitest or jest from a hoisting ancestor", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "package.json",
    JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { vitest: "^2" },
    }),
  );
  write(root, "packages/x/package.json", JSON.stringify({ name: "x" }));
  write(root, "packages/y/nested/package.json", JSON.stringify({ name: "y-nested" }));
  write(
    root,
    "packages/y/package.json",
    JSON.stringify({ name: "y", devDependencies: { jest: "^29" } }),
  );

  const x = planTestCommand(root, ["packages/x/src/a.test.ts"], "subset");
  assert.equal(x.command, "cd packages/x && npx vitest run src/a.test.ts");
  assert.match(x.commandReason, /inherited/);

  const nested = planTestCommand(root, ["packages/y/nested/b.test.ts"], "subset");
  assert.equal(
    nested.commands[0]?.command,
    "npx jest --runTestsByPath b.test.ts",
    "the nearest declaring ancestor wins",
  );
});

// Covers: req~affected-test-selection~1
test("node --test script flags keep their values and directory args are globs", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "package.json",
    JSON.stringify({
      scripts: {
        test: "node --import ./register.mjs --test --test-coverage-lines 80 --test-reporter spec 'test/**/*.test.ts'",
      },
    }),
  );
  const res = planTestCommand(root, ["test/unit/a.test.ts"], "subset");
  assert.equal(
    res.command,
    "node --import ./register.mjs --test --test-reporter spec test/unit/a.test.ts",
  );

  const dirRoot = tmpRepo(t);
  write(dirRoot, "package.json", JSON.stringify({ scripts: { test: "node --test test/" } }));
  const dir = planTestCommand(dirRoot, ["test/unit/a.test.ts"], "subset");
  assert.equal(dir.command, "node --test test/unit/a.test.ts");
});
