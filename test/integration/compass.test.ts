import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, has } from "../helpers/env.js";
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
  const names = impact(root, "gamma").map((n) => n.name);
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
