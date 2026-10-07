import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, has, write } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { search, explore, recall, impact, trace } from "../../src/modules/compass/query.js";
import { graphData, visualize } from "../../src/modules/compass/visualize.js";
import { indexExists, indexPath } from "../../src/modules/compass/db.js";

test("buildIndex parses a multi-language repo into nodes, edges, and embeddings", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  const stats = await buildIndex(root);

  assert.equal(stats.files, 4, "indexes the 4 source files, skipping node_modules");
  assert.ok(stats.nodes > 0);
  assert.ok(stats.edges > 0);
  assert.equal(stats.embeddings, stats.nodes);
  assert.ok(indexExists(root));
  assert.equal(indexPath(root), path.join(root, ".speclaw", "index.db"));
  // A fresh index: the totals are the whole repository and equal this run's delta.
  assert.deepEqual(stats.totals, { files: 4, nodes: stats.nodes, edges: stats.edges });
  assert.match(stats.nextStep, /compass_find/);
  assert.match(stats.nextStep, /compass_explore/);
});

test("search finds a node by name substring", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const hits = search(root, "alpha");
  assert.ok(hits.some((h) => h.name === "alpha"));
  assert.equal(search(root, "alpha", 1).length, 1);
});

test("explore returns source, callees, and callers for an exact node", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const res = explore(root, "alpha");
  assert.equal(res.found, true);
  assert.match(res.symbol!.source, /function alpha/);
  const callees = res.callees!.map((c) => c.name);
  assert.ok(callees.includes("beta"));
  assert.ok(callees.includes("helper"));
  assert.ok(res.callers!.some((c) => c.name === "render"));
});

test("explore falls back to fuzzy matches when no exact node exists", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const res = explore(root, "alph");
  assert.equal(res.found, false);
  assert.ok(res.otherMatches!.some((m) => m.name === "alpha"));
});

// Stored offsets are UTF-16 code-unit indices into the decoded source; a byte
// slice drifts by every extra UTF-8 byte (and surrogate pair) that precedes the
// symbol. The BOM file checks that decoding and the parser agree on offset 0.
// Covers: req~explore-exact-source~1
test("explore returns exact source after multibyte text", async (t) => {
  const root = tmpRepo(t);
  // The declaration node starts at `function`, not at the `export` keyword.
  const target = 'function target(a: number): string {\n  return "señal «" + a + "» —";\n}';
  write(
    root,
    "src/multibyte.ts",
    `// Diseño — «comillas» y la eñe, más un emoji 🚀 antes del símbolo.\n` +
      `const label = "año — «x» 😀";\n` +
      `export ${target}\n`,
  );
  const bomTarget = "function bommed(): number {\n  return 1;\n}";
  write(root, "src/bom.ts", `\uFEFF// ñandú 🚀\nexport ${bomTarget}\n`);
  await buildIndex(root);

  const res = explore(root, "target");
  assert.equal(res.found, true);
  assert.ok(res.symbol!.source.startsWith("function target("), res.symbol!.source);
  assert.ok(res.symbol!.source.endsWith("}"), res.symbol!.source);
  assert.equal(res.symbol!.source, target);

  const bom = explore(root, "bommed");
  assert.equal(bom.found, true);
  assert.equal(bom.symbol!.source, bomTarget);
});

// Covers: req~explore-file-path~1
// Unique basename: `main.ts` occurs once in the seed fixture (only `src/main.ts`).
test("explore resolves a repo-relative path or unique basename to a file symbol", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  // Stem `scroll` is not the first function; stem `onlyclass` is a class after a function;
  // stem `Marker` is an interface after another symbol. `blank.ts` defines nothing.
  // `dup.ts` is shared by two directories, so the basename is ambiguous and the
  // suffix `src/dup.ts` is not unique.
  write(
    root,
    "src/scroll.ts",
    "export function other(): number { return 0; }\nexport function scroll(): number { return 1; }\n",
  );
  write(
    root,
    "src/onlyclass.ts",
    "export function nope(): number { return 0; }\nexport class onlyclass {}\n",
  );
  write(
    root,
    "src/Marker.ts",
    "export type Other = string;\nexport interface Marker { x: number; }\n",
  );
  write(root, "src/blank.ts", "\n");
  write(root, "lib/src/dup.ts", "export function fromA(): number { return 1; }\n");
  write(root, "pkg/src/dup.ts", "export function fromB(): number { return 2; }\n");
  await buildIndex(root);

  const main = explore(root, "src/main.ts");
  assert.equal(main.found, true);
  assert.equal(main.symbol!.name, "gamma");
  assert.equal(main.symbol!.kind, "function");
  assert.equal(main.symbol!.file, "src/main.ts");
  assert.match(main.symbol!.source, /function gamma/);
  assert.ok(main.otherMatches!.some((m) => m.name === "alpha"));
  assert.match(main.message ?? "", /resolved to gamma/);

  // `src/util.ts` stem is `util`, which matches no symbol, so the primary is `helper`.
  const util = explore(root, "src/util.ts");
  const helper = explore(root, "helper");
  assert.equal(util.found, true);
  assert.equal(util.symbol!.name, "helper");
  assert.equal(util.symbol!.file, "src/util.ts");
  assert.deepEqual(util.callees, helper.callees);
  assert.deepEqual(util.callers, helper.callers);

  const byBasename = explore(root, "main.ts");
  assert.equal(byBasename.found, true);
  assert.equal(byBasename.symbol!.name, "gamma");
  assert.equal(byBasename.symbol!.file, "src/main.ts");

  assert.equal(explore(root, "./src/main.ts").symbol!.name, "gamma");
  assert.equal(explore(root, "src\\main.ts").symbol!.name, "gamma");
  assert.equal(explore(root, path.join(root, "src", "util.ts")).symbol!.name, "helper");

  const stem = explore(root, "src/scroll.ts");
  assert.equal(stem.found, true);
  assert.equal(stem.symbol!.name, "scroll");
  assert.equal(stem.symbol!.kind, "function");
  assert.ok(stem.otherMatches!.some((m) => m.name === "other"));

  const asClass = explore(root, "src/onlyclass.ts");
  assert.equal(asClass.found, true);
  assert.equal(asClass.symbol!.name, "onlyclass");
  assert.equal(asClass.symbol!.kind, "class");

  const asInterface = explore(root, "src/Marker.ts");
  assert.equal(asInterface.found, true);
  assert.equal(asInterface.symbol!.name, "Marker");
  assert.equal(asInterface.symbol!.kind, "interface");

  const blank = explore(root, "src/blank.ts");
  assert.equal(blank.found, false);
  assert.match(blank.message ?? "", /no symbols/i);
  assert.doesNotMatch(blank.message ?? "", /0 similar/);

  const ambiguous = explore(root, "dup.ts");
  assert.equal(ambiguous.found, false);
  assert.match(ambiguous.message ?? "", /ambiguous/i);
  assert.ok(ambiguous.otherMatches!.some((m) => m.name === "fromA" && m.file === "lib/src/dup.ts"));
  assert.ok(ambiguous.otherMatches!.some((m) => m.name === "fromB" && m.file === "pkg/src/dup.ts"));

  const sharedSuffix = explore(root, "src/dup.ts");
  assert.equal(sharedSuffix.found, false);
  assert.ok(sharedSuffix.otherMatches!.some((m) => m.name === "fromA"));
  assert.ok(sharedSuffix.otherMatches!.some((m) => m.name === "fromB"));

  const pathHits = search(root, "src/util.ts");
  assert.ok(pathHits.some((h) => h.name === "helper" && h.file === "src/util.ts"));
  // `%` and `_` must stay literal: unescaped `%a%a%` and `%alp_a%` would match `alpha`.
  assert.ok(!search(root, "a%a").some((h) => h.name === "alpha"));
  assert.ok(!search(root, "alp_a").some((h) => h.name === "alpha"));
});

test("recall ranks nodes by semantic similarity", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const hits = await recall(root, "widget render", 5);
  assert.ok(hits.length > 0 && hits.length <= 5);
  // scores are sorted descending
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1]!.score >= hits[i]!.score);
});

test("impact walks callers transitively", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const names = (impact(root, { symbol: "gamma", format: "flat" }).nodes ?? []).map((n) => n.name);
  assert.ok(names.includes("beta"));
  assert.ok(names.includes("alpha"));
});

test("trace finds a call path, handles identity, and reports no route", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);

  const found = trace(root, "alpha", "gamma");
  assert.deepEqual(found.path, ["alpha", "beta", "gamma"]);
  assert.equal(found.hops, 2);

  assert.deepEqual(trace(root, "alpha", "alpha"), {
    from: "alpha",
    to: "alpha",
    path: ["alpha"],
    hops: 0,
  });

  const none = trace(root, "gamma", "alpha");
  assert.equal(none.path, null);
  assert.equal(none.hops, -1);
});

test("query functions throw when no index has been built", (t) => {
  const root = tmpRepo(t);
  assert.throws(() => search(root, "x"), /No index/);
  assert.throws(() => explore(root, "x"), /No index/);
  assert.throws(() => impact(root, "x"), /No index/);
  assert.throws(() => trace(root, "x", "y"), /No index/);
  assert.rejects(() => recall(root, "x"), /No index/);
});

test("visualize writes an HTML graph, with and without a focus node", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);

  const whole = visualize(root);
  assert.ok(has(root, ".speclaw/graph.html"));
  assert.ok(whole.shown > 0);
  assert.equal(whole.total, whole.total);

  const focused = graphData(root, { focus: "alpha", depth: 1 });
  assert.equal(focused.focus, "alpha");
  assert.ok(focused.nodes.some((n) => n.name === "alpha"));

  const html = fs.readFileSync(path.join(root, ".speclaw", "graph.html"), "utf8");
  assert.match(html, /Compass graph/);
});

test("graphData throws without an index", (t) => {
  const root = tmpRepo(t);
  assert.throws(() => graphData(root), /No index/);
});

test("buildIndex is incremental — unchanged files are skipped, removed files pruned", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);

  const second = await buildIndex(root);
  assert.equal(second.files, 0, "no files re-indexed");
  assert.equal(second.unchanged, 4);

  fs.rmSync(path.join(root, "src", "greet.js"));
  const third = await buildIndex(root);
  assert.equal(third.removed, 1);
});
