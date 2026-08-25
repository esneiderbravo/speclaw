import { test } from "node:test";
import assert from "node:assert/strict";
import { dirHash, HASH_EMPTY, buildDirHashMap } from "../../src/modules/compass/merkle.js";

test("dirHash is order-independent", () => {
  const a = dirHash([
    { name: "b.ts", hash: "1" },
    { name: "a.ts", hash: "2" },
  ]);
  const b = dirHash([
    { name: "a.ts", hash: "2" },
    { name: "b.ts", hash: "1" },
  ]);
  assert.equal(a, b);
});

test("empty directory hashes to HASH_EMPTY", () => {
  assert.equal(dirHash([]), HASH_EMPTY);
});

test("buildDirHashMap root changes when a file is removed", () => {
  const full = buildDirHashMap(
    new Map([
      ["src/a.ts", "aaa"],
      ["src/b.ts", "bbb"],
    ]),
  );
  const one = buildDirHashMap(new Map([["src/a.ts", "aaa"]]));
  assert.notEqual(full.get(""), one.get(""));
  assert.ok(full.get("src"));
});

test("byte-order sort differs from locale for mixed case when needed", () => {
  // Both orders must still produce one stable hash
  const h1 = dirHash([
    { name: "A.ts", hash: "x" },
    { name: "a.ts", hash: "y" },
  ]);
  const h2 = dirHash([
    { name: "a.ts", hash: "y" },
    { name: "A.ts", hash: "x" },
  ]);
  assert.equal(h1, h2);
});
