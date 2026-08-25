import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMeaningfulIdent,
  personalizedPageRank,
  type PrEdge,
} from "../../src/modules/compass/pagerank.js";

test("isMeaningfulIdent requires length and camel/snake", () => {
  assert.equal(isMeaningfulIdent("getUserById"), true);
  assert.equal(isMeaningfulIdent("user_id_x"), true);
  assert.equal(isMeaningfulIdent("run"), false);
  assert.equal(isMeaningfulIdent("handler"), false);
});

test("personalizedPageRank converges and sums ~1", () => {
  const edges: PrEdge[] = [
    { from: 1, to: 2, weight: 1 },
    { from: 2, to: 3, weight: 1 },
    { from: 1, to: 3, weight: 1 },
  ];
  const scores = personalizedPageRank([1, 2, 3], edges, [1]);
  const sum = [...scores.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.05, `sum=${sum}`);
  assert.ok((scores.get(1) ?? 0) > 0);
});

test("focus personalization changes order", () => {
  const edges: PrEdge[] = [
    { from: 10, to: 1, weight: 1 },
    { from: 20, to: 2, weight: 1 },
  ];
  const focusA = personalizedPageRank([10, 20, 1, 2], edges, [10]);
  const focusB = personalizedPageRank([10, 20, 1, 2], edges, [20]);
  assert.ok((focusA.get(1) ?? 0) > (focusA.get(2) ?? 0));
  assert.ok((focusB.get(2) ?? 0) > (focusB.get(1) ?? 0));
});
