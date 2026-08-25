import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RRF_K,
  escapeFtsQuery,
  isSymbolQuery,
  nameBoost,
  routeWeights,
  rrfFuse,
  structuralScore,
} from "../../src/modules/compass/rank.js";

test("isSymbolQuery distinguishes identifiers from prose", () => {
  assert.equal(isSymbolQuery("getUserById"), true);
  assert.equal(isSymbolQuery("foo.bar"), true);
  assert.equal(isSymbolQuery("user by id"), false);
  assert.equal(isSymbolQuery("validate the session token"), false);
});

test("routeWeights: symbol sparse-heavy, prose dense-heavy", () => {
  const s = routeWeights("authenticate");
  assert.ok(s.bm25 >= s.knn);
  const p = routeWeights("validate session token");
  assert.ok(p.knn > p.bm25);
});

test("rrfFuse uses ranks only with k=60", () => {
  const scores = rrfFuse({ a: [1, 2], b: [2, 3] }, { a: 1, b: 1 }, RRF_K);
  // node 2 appears in both lists at ranks 2 and 1
  assert.ok((scores.get(2) ?? 0) > (scores.get(1) ?? 0));
  assert.ok(Math.abs(1 / (RRF_K + 1) - 0.016393) < 0.001);
});

test("nameBoost prefers exact match", () => {
  assert.ok(nameBoost("Foo", "Foo") > nameBoost("FooBar", "Foo"));
  assert.ok(nameBoost("foo", "FOO") > 1);
});

test("escapeFtsQuery quotes terms and doubles internal quotes", () => {
  assert.equal(escapeFtsQuery("AND NEAR *"), `"AND" "NEAR" "*"`);
  const escaped = escapeFtsQuery('say "hi"');
  assert.match(escaped, /"say"/);
  assert.match(escaped, /""hi""/);
});

test("structuralScore never uses path distance; hops dampen", () => {
  const near = structuralScore(1, {
    pagerank: 0.1,
    commits30d: 0,
    hopsToFocus: 0,
    isDefinition: true,
  });
  const far = structuralScore(1, {
    pagerank: 0.1,
    commits30d: 0,
    hopsToFocus: 5,
    isDefinition: true,
  });
  assert.ok(near > far);
});
