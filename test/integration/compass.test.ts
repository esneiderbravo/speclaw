import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, has, write } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { search, explore, recall, impact, trace } from "../../src/modules/compass/query.js";
import { graphData, visualize } from "../../src/modules/compass/visualize.js";
import { generateCompactMap } from "../../src/modules/compass/map.js";
import { indexExists, indexPath, openDb } from "../../src/modules/compass/db.js";
import { affectedTests } from "../../src/modules/compass/affected.js";
import { exploreRich, findSymbols } from "../../src/modules/compass/explore-rich.js";

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

// Covers: req~explore-file-path~2
// Unique basename: `main.ts` occurs once in the seed fixture (only `src/main.ts`).
test("explore resolves a repo-relative path or unique basename to a file symbol", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  // Stem `scroll` is not the first function; stem `onlyclass` is a class after a function;
  // stem `Marker` is an interface after another symbol. `blank.ts` defines nothing
  // and references nothing.
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

  // A symbol-less file always has a file-owner node (so imports of it
  // resolve), and path explore lands on it.
  const blank = explore(root, "src/blank.ts");
  assert.equal(blank.found, true);
  assert.equal(blank.symbol?.kind, "file");
  assert.deepEqual(blank.callees, []);
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

/** Explore output read structurally (fields added by schema 11). */
interface ExploreShape {
  callees?: Array<{ name: string; file?: string; line: number }>;
  unresolvedCallees?: { count: number; sample: string[] };
}

/** `src/a.ts` defines `alpha`; `test/a.test.ts` declares nothing and calls it in a callback. */
function seedCallbackRepo(root: string): void {
  write(root, "src/a.ts", "export function alpha(): number { return 1; }\n");
  write(
    root,
    "test/a.test.ts",
    `import { alpha } from "../src/a.js";
import { test } from "node:test";

test("alpha", () => {
  const items: number[] = [];
  items.push(alpha());
});
`,
  );
}

// Covers: req~compass-mcp-surface~1
test("callees list only resolved symbols and count the unresolved", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/caller.ts",
    `export function helper2(): number { return 2; }
export function caller(items: number[]): void {
  helper2();
  items.push(1);
  items.map((x) => x + 1);
  console.log(items);
  helper2();
}
`,
  );
  await buildIndex(root);

  const res = explore(root, "caller") as unknown as ExploreShape;
  const callees = res.callees ?? [];
  assert.ok(callees.length > 0);
  assert.ok(
    callees.every((c) => typeof c.file === "string" && c.file.length > 0),
    JSON.stringify(callees),
  );
  assert.deepEqual(
    callees.map((c) => c.name),
    ["helper2"],
    "resolved callees are de-duplicated by node id",
  );
  assert.ok((res.unresolvedCallees?.count ?? 0) >= 3, JSON.stringify(res.unresolvedCallees));
  assert.ok(res.unresolvedCallees?.sample.includes("push"));
  assert.ok(res.unresolvedCallees?.sample.includes("log"));
});

// Covers: req~impact-id-first~1
test("member calls on non-project receivers do not bind by name", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/stack.ts", "export function push(x: number): number { return x; }\n");
  write(
    root,
    "src/use.ts",
    `import * as stack from "./stack.js";
export function useIt(items: number[]): void {
  items.push(1);
}
export function viaNamespace(): number {
  return stack.push(2);
}
export class Box {
  push(x: number): number { return x; }
  run(): number { return this.push(3); }
}
`,
  );
  await buildIndex(root);

  const db = openDb(root);
  const rows = db
    .prepare(
      `SELECT owner.name AS owner, e.is_member AS isMember, e.dst_node_id AS dst
       FROM edges e JOIN nodes owner ON owner.id = e.src_node_id
       WHERE e.kind = 'call' AND e.dst_name = 'push' ORDER BY e.line`,
    )
    .all() as Array<{ owner: string; isMember: number; dst: number | null }>;
  db.close();
  const byOwner = new Map(rows.map((r) => [r.owner, r]));
  assert.equal(byOwner.get("useIt")?.isMember, 1);
  assert.equal(byOwner.get("useIt")?.dst, null);
  assert.equal(byOwner.get("viaNamespace")?.isMember, 2, "import binding receiver");
  assert.notEqual(byOwner.get("viaNamespace")?.dst, null, "its import resolved, so it binds");
  assert.equal(byOwner.get("run")?.isMember, 0, "this receiver");

  const names = (impact(root, { symbol: "push", format: "flat" }).nodes ?? []).map((n) => n.name);
  assert.ok(!names.includes("useIt"), names.join(","));
  const callers = explore(root, "push").callers ?? [];
  assert.ok(!callers.some((c) => c.name === "useIt"), JSON.stringify(callers));
});

// Covers: req~impact-id-first~1
test("a function called only from a test callback lists that caller", async (t) => {
  const root = tmpRepo(t);
  seedCallbackRepo(root);
  await buildIndex(root);

  const res = explore(root, "alpha");
  assert.ok(
    (res.callers ?? []).some((c) => c.kind === "file" && c.file === "test/a.test.ts"),
    JSON.stringify(res.callers),
  );
  const db = openDb(root);
  const orphan = db.prepare("SELECT COUNT(*) AS n FROM edges WHERE src_node_id IS NULL").get() as {
    n: number;
  };
  db.close();
  assert.equal(orphan.n, 0, "every indexed edge has an owner");
  assert.ok(affectedTests(root, { symbols: ["alpha"] }).tests.length >= 1);
});

// Covers: req~compass-mcp-surface~1
test("file-owner nodes are hidden from find and name explore", async (t) => {
  const root = tmpRepo(t);
  seedCallbackRepo(root);
  seedSampleRepo(root);
  // A pure re-export barrel and a symbol-less module also get a file-owner node.
  write(root, "src/index.ts", `export * from "./main.js";\n`);
  write(root, "src/consts.ts", "export const LIMIT = 3;\n");
  const stats = await buildIndex(root);

  const db = openDb(root);
  const fileNodes = db
    .prepare("SELECT id, name FROM nodes WHERE kind = 'file' ORDER BY name")
    .all() as Array<{ id: number; name: string }>;
  const sideRows = (table: string): number =>
    Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM ${table} WHERE node_id IN (SELECT id FROM nodes WHERE kind = 'file')`,
          )
          .get() as { n: number }
      ).n,
    );
  const sides = {
    pagerank: sideRows("pagerank"),
    node_text: sideRows("node_text"),
    node_metrics: sideRows("node_metrics"),
    node_embeddings: sideRows("node_embeddings"),
  };
  const visible = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM nodes WHERE kind <> 'file'").get() as { n: number }).n,
  );
  db.close();

  assert.deepEqual(
    fileNodes.map((n) => n.name),
    ["src/consts.ts", "src/index.ts", "src/main.ts", "test/a.test.ts"],
    "files with orphan references, re-exports, or no symbols get a file-owner node",
  );
  assert.deepEqual(sides, { pagerank: 0, node_text: 0, node_metrics: 0, node_embeddings: 0 });
  assert.equal(stats.totals.nodes, visible);

  assert.ok(!search(root, "a.test").some((h) => h.kind === "file"));
  const found = (await findSymbols(root, "a.test", "exact")) as { hits: Array<{ kind: string }> };
  assert.ok(!found.hits.some((h) => h.kind === "file"));
  // A name lookup never lands on the file node: `src/main.ts` resolves by path to gamma.
  assert.equal(explore(root, "src/main.ts").symbol?.name, "gamma");
  for (const q of ["src/index.ts", "index", "consts"]) {
    assert.ok(!search(root, q).some((h) => h.kind === "file"), q);
    const hits = (await findSymbols(root, q, "exact")) as { hits: Array<{ kind: string }> };
    assert.ok(!hits.hits.some((h) => h.kind === "file"), q);
  }
  const graph = graphData(root);
  assert.ok(!graph.nodes.some((n) => n.kind === "file"), JSON.stringify(graph.nodes));
  assert.equal(graph.total, visible);
  assert.match(generateCompactMap(root) ?? "", new RegExp(` ${visible} nodes`));
});

// Covers: req~explore-file-path~2
test("path explore of a declaration-less file resolves to its file-owner node", async (t) => {
  const root = tmpRepo(t);
  seedCallbackRepo(root);
  await buildIndex(root);

  const res = explore(root, "test/a.test.ts");
  assert.equal(res.found, true, res.message);
  assert.equal(res.symbol?.kind, "file");
  assert.equal(res.symbol?.file, "test/a.test.ts");
  assert.ok(
    (res.callees ?? []).some((c) => c.name === "alpha" && c.file === "src/a.ts"),
    JSON.stringify(res.callees),
  );
  const rich = await exploreRich({ projectPath: root, node: "test/a.test.ts" });
  assert.deepEqual(rich.affectedTests?.files, ["test/a.test.ts"]);
});
