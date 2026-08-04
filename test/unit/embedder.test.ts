import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  LexicalEmbedder,
  getEmbedder,
  setEmbedder,
  toBlob,
  fromBlob,
  cosine,
  type Embedder,
} from "../../src/modules/compass/embedder.js";

test("tokenize splits camelCase, snake_case, and dots, dropping short tokens", () => {
  // splits a single lower/digit -> Upper boundary
  assert.deepEqual(tokenize("parseRequest"), ["parse", "request"]);
  assert.deepEqual(tokenize("read_file.path"), ["read", "file", "path"]);
  // single-character tokens are dropped
  assert.deepEqual(tokenize("a bb c"), ["bb"]);
});

test("LexicalEmbedder produces an L2-normalized vector of the configured dim", () => {
  const e = new LexicalEmbedder(64);
  const v = e.embed("open database connection");
  assert.equal(v.length, 64);
  const norm = Math.sqrt([...v].reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6, `expected unit norm, got ${norm}`);
});

test("LexicalEmbedder is deterministic", () => {
  const e = new LexicalEmbedder();
  assert.deepEqual([...e.embed("hello world")], [...e.embed("hello world")]);
});

test("embedding empty text yields a zero vector (norm guarded to 1)", () => {
  const v = new LexicalEmbedder(16).embed("");
  assert.ok([...v].every((x) => x === 0));
});

test("toBlob/fromBlob round-trips a vector", () => {
  const v = new LexicalEmbedder(32).embed("round trip");
  const back = fromBlob(toBlob(v));
  assert.deepEqual([...back], [...v]);
});

test("fromBlob accepts a Uint8Array as well as a Buffer", () => {
  const v = new LexicalEmbedder(8).embed("bytes");
  const bytes = new Uint8Array(toBlob(v));
  assert.deepEqual([...fromBlob(bytes)], [...v]);
});

test("cosine of identical unit vectors is ~1, orthogonal is ~0", () => {
  const e = new LexicalEmbedder();
  const a = e.embed("database connection pool");
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-6);
  const b = new Float32Array([1, 0]);
  const c = new Float32Array([0, 1]);
  assert.equal(cosine(b, c), 0);
});

test("getEmbedder/setEmbedder swap the active embedder", () => {
  const original = getEmbedder();
  try {
    const stub: Embedder = { id: "stub", dim: 2, embed: () => new Float32Array([1, 0]) };
    setEmbedder(stub);
    assert.equal(getEmbedder().id, "stub");
  } finally {
    setEmbedder(original);
  }
});
