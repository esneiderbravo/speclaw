import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { exploreRich } from "../../src/modules/compass/explore-rich.js";
import { investigate } from "../../src/modules/lawbook/investigate.js";
import { normalizeTracePath } from "../../src/modules/lawbook/stack-parse.js";
import { readIndexStats } from "../../src/shared/index-stats.js";

/** A failing test five calls above a rounding bug, among look-alike helpers. */
async function chainRepo(root: string): Promise<void> {
  for (const d of ["audit", "catalog", "report"]) {
    write(
      root,
      `src/${d}/helpers.js`,
      `export function ${d}Round(x) {\n  return Math.round(x * 100) / 100;\n}\n`,
    );
  }
  write(
    root,
    "src/money/round-cents.js",
    "export function roundCents(x) {\n  return Math.floor(x * 100) / 100;\n}\n",
  );
  write(
    root,
    "src/tax/compute.js",
    'import { roundCents } from "../money/round-cents.js";\nexport function withTax(a) {\n  return roundCents(a * 1.08);\n}\n',
  );
  write(
    root,
    "src/cart/checkout.js",
    'import { withTax } from "../tax/compute.js";\nexport function checkout(items) {\n  return withTax(items.reduce((s, i) => s + i, 0));\n}\n',
  );
  write(
    root,
    "test/checkout.test.js",
    'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { checkout } from "../src/cart/checkout.js";\ntest("total", () => assert.equal(checkout([29.97]), 32.37));\n',
  );
  await buildIndex(root);
}

test("compass_explore with maxDepth returns the callee chain with source in one call", async (t) => {
  const root = tmpRepo(t);
  await chainRepo(root);
  const r = await exploreRich({
    projectPath: root,
    node: "checkout",
    include: ["source", "callees"],
    maxDepth: 4,
  });
  assert.deepEqual(
    r.chain?.map((n) => [n.name, n.depth]),
    [
      ["withTax", 1],
      ["roundCents", 2],
    ],
  );
  assert.match(r.chain?.[1]?.source ?? "", /Math\.floor/);

  const path = await exploreRich({ projectPath: root, node: "checkout", to: "roundCents" });
  assert.deepEqual(
    path.chain?.map((n) => n.name),
    ["withTax", "roundCents"],
  );

  const flat = await exploreRich({ projectPath: root, node: "checkout", include: ["callees"] });
  assert.equal(flat.chain, undefined, "depth 1 keeps the old shape");
});

test("investigate anchors suspects on code the failing test reaches, never the test itself", async (t) => {
  const root = tmpRepo(t);
  await chainRepo(root);
  const trace =
    "AssertionError: 32.36 !== 32.37\n" +
    `    at TestContext.<anonymous> (file://${fs.realpathSync(root)}/test/checkout.test.js:4:35)\n` +
    "    at Test.runInAsyncScope (node:async_hooks:227:14)\n";
  const r = await investigate({ projectPath: root, stackTrace: trace, symptom: "rounding" });
  const names = r.suspects.map((s) => s.name);
  assert.equal(names[0], "roundCents", names.join(", "));
  assert.ok(!names.some((n) => /Round$/.test(n)), `look-alikes off the path: ${names}`);
  assert.ok(!r.suspects.some((s) => s.file.startsWith("test/")), "a test is never a suspect");
  assert.ok(r.suspects[0]!.reasons.some((x) => x.reason === "leaf"));
  assert.deepEqual(r.unresolvedFrames, [], "runtime frames are not listed");
});

test("trace paths resolve under a symlinked project root", (t) => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), "speclaw-real-"));
  const link = `${real}-link`;
  fs.symlinkSync(real, link);
  t.after(() => {
    fs.rmSync(link, { force: true });
    fs.rmSync(real, { recursive: true, force: true });
  });
  const realRoot = fs.realpathSync(real);
  assert.equal(normalizeTracePath(link, `file://${realRoot}/src/a.js`), "src/a.js");
  assert.equal(normalizeTracePath(link, `${realRoot}/src/a.js`), "src/a.js");
});

test("an index run records its totals for the hooks", async (t) => {
  const root = tmpRepo(t);
  await chainRepo(root);
  assert.equal(readIndexStats(root)?.files, 7);
});
