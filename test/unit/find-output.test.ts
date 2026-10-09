// Covers: req~find-response-budget~1
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFindResponse, type FindResult } from "../../src/modules/compass/find-output.js";
import { renderTreeContext } from "../../src/modules/compass/budget.js";
import type { HybridHit } from "../../src/modules/compass/hybrid.js";
import { estimateTokens } from "../../src/shared/output-budget.js";

function hit(i: number, signature: string | null = `function f${i}(): void {`): HybridHit {
  return {
    nodeId: i,
    name: `f${i}`,
    kind: "function",
    file: `src/f${i}.ts`,
    line: 1,
    signature,
    signals: { pagerank: 0.1, hops: 0, score: 1 / (i + 1) },
  };
}

function result(partial: Partial<FindResult>): FindResult {
  const hits = partial.hits ?? [];
  return {
    rendered: renderTreeContext(hits),
    tokens: 0,
    budget: 0,
    route: "symbol",
    focus: [],
    hits,
    degraded: [],
    mode: "concept",
    focusIgnored: [],
    cap: 1500,
    capped: false,
    ...partial,
  };
}

test("a response under the cap is emitted whole with exact tokens", () => {
  const out = formatFindResponse(result({ hits: [hit(1), hit(2)] }));
  const body = JSON.parse(out) as Record<string, unknown>;
  assert.equal("truncated" in body, false);
  assert.equal(body.tokens, estimateTokens(out));
  assert.equal(body.budget, 1500);
  assert.deepEqual(Object.keys(body), ["mode", "rendered", "hits", "focus", "tokens", "budget"]);
});

test("a capped search result is reported truncated even when it fits", () => {
  const body = JSON.parse(formatFindResponse(result({ hits: [hit(1)], capped: true }))) as {
    truncated?: boolean;
  };
  assert.equal(body.truncated, true);
});

test("lowest-ranked hits go first, then the last rendered block is shortened", () => {
  const huge = `function f0(${"a: string, ".repeat(200)}): void {`;
  const out = formatFindResponse(result({ hits: [hit(0, huge), hit(1), hit(2)], cap: 256 }));
  const body = JSON.parse(out) as { hits: unknown[]; rendered: string; truncated?: boolean };
  assert.ok(estimateTokens(out) <= 256, String(estimateTokens(out)));
  assert.equal(body.truncated, true);
  assert.equal(body.hits.length, 1, "kept the top-ranked hit");
  assert.match(body.rendered, /⋮$/, "its block was shortened");
});

test("nearest entries are dropped from the end once the context lists are empty", () => {
  const long = (i: number) => ({
    name: `nearbyNameNumber${i}${"x".repeat(60)}`,
    kind: "function",
    file: `src/a/very/deep/path/${"d".repeat(60)}/n${i}.ts`,
    line: i,
  });
  const out = formatFindResponse(
    result({
      mode: "exact",
      found: false,
      terms: ["missing"],
      hits: [],
      rendered: "",
      nearest: [1, 2, 3, 4, 5].map(long),
      cap: 256,
      focusIgnored: ["notes.md"],
      degraded: ["no-embeddings"],
    }),
  );
  const body = JSON.parse(out) as {
    nearest: unknown[];
    truncated?: boolean;
    found: boolean;
    terms: string[];
    termsTotal?: number;
    focusIgnored: string[];
    focusIgnoredTotal?: number;
    degraded: string[];
  };
  assert.ok(estimateTokens(out) <= 256);
  assert.ok(body.nearest.length < 5 && body.nearest.length >= 1, String(body.nearest.length));
  assert.equal(body.truncated, true);
  assert.equal(body.found, false);
  // The context lists were emptied before nearest shrank; their totals remain.
  assert.deepEqual(body.terms, []);
  assert.equal(body.termsTotal, 1);
  assert.deepEqual(body.focusIgnored, []);
  assert.equal(body.focusIgnoredTotal, 1);
  assert.deepEqual(body.degraded, ["no-embeddings"]);
});

test("focusIgnored, then focus, then terms are trimmed with their totals", () => {
  const paths = (tag: string) =>
    Array.from({ length: 200 }, (_, i) => `src/${tag}/deeply/nested/file-${i}.ts`);
  const terms = Array.from({ length: 200 }, (_, i) => `someLongIdentifierName${i}`);
  const out = formatFindResponse(
    result({
      hits: [hit(1)],
      mode: "exact",
      found: true,
      terms,
      focus: paths("focus"),
      focusIgnored: paths("ignored"),
      cap: 256,
    }),
  );
  const body = JSON.parse(out) as Record<string, unknown>;
  assert.ok(estimateTokens(out) <= 256, String(estimateTokens(out)));
  assert.equal(body.tokens, estimateTokens(out));
  assert.equal(body.truncated, true);
  assert.equal((body.hits as unknown[]).length, 1);
  // focusIgnored is cut first (to nothing here), then focus, then terms.
  assert.deepEqual(body.focusIgnored, []);
  assert.equal(body.focusIgnoredTotal, 200);
  assert.equal(body.focusTotal, 200);
  assert.equal(body.termsTotal, 200);
  assert.ok((body.terms as unknown[]).length < 200);
});

// Covers: req~find-response-budget~1
test("context lists are cut before any hit when focus is what overflows", () => {
  const focus = Array.from({ length: 200 }, (_, i) => `src/area/deeply/nested/file-${i}.ts`);
  const hits = [hit(1), hit(2), hit(3), hit(4)];
  const out = formatFindResponse(result({ hits, focus, focusIgnored: focus, cap: 256 }));
  const body = JSON.parse(out) as {
    hits: unknown[];
    rendered: string;
    focus: string[];
    focusTotal?: number;
    focusIgnored?: string[];
    focusIgnoredTotal?: number;
    truncated?: boolean;
  };
  assert.ok(estimateTokens(out) <= 256, String(estimateTokens(out)));
  assert.equal(body.truncated, true);
  assert.equal(body.hits.length, 4, "every hit survives; only the lists shrink");
  assert.equal(body.rendered, renderTreeContext(hits));
  assert.deepEqual(body.focusIgnored, []);
  assert.equal(body.focusIgnoredTotal, 200);
  assert.equal(body.focusTotal, 200);
  assert.ok(body.focus.length < 200);
});

test("a list that fits after trimming keeps its longest prefix", () => {
  const focus = Array.from({ length: 120 }, (_, i) => `src/area/file-${i}.ts`);
  const out = formatFindResponse(result({ hits: [hit(1)], focus, cap: 400 }));
  const body = JSON.parse(out) as { focus: string[]; focusTotal?: number; truncated?: boolean };
  assert.ok(estimateTokens(out) <= 400);
  assert.equal(body.truncated, true);
  assert.equal(body.focusTotal, 120);
  assert.ok(body.focus.length > 0 && body.focus.length < 120);
  assert.deepEqual(body.focus, focus.slice(0, body.focus.length));
});

test("a single hit larger than the cap is dropped", () => {
  const big = { ...hit(1, null), file: `src/${"x".repeat(256 * 4)}.ts` };
  const out = formatFindResponse(result({ hits: [big], cap: 256 }));
  assert.ok(estimateTokens(out) <= 256, String(estimateTokens(out)));
  const body = JSON.parse(out) as { hits: unknown[]; truncated?: boolean };
  assert.equal(body.hits.length, 0);
  assert.equal(body.truncated, true);
});
