import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { openDb } from "../../src/modules/compass/db.js";
import { NORMALIZER_VERSION, rawHash } from "../../src/modules/compass/hash.js";

test("NORMALIZER_VERSION is a positive integer", () => {
  assert.equal(typeof NORMALIZER_VERSION, "number");
  assert.ok(NORMALIZER_VERSION >= 1);
});

test("rawHash is sensitive to exact bytes", () => {
  const a = rawHash("function f(){return 1}", 0, 21);
  const b = rawHash("function f(){return 2}", 0, 21);
  assert.notEqual(a, b);
  assert.equal(rawHash("abc", 0, 3), rawHash("abc", 0, 3));
});

test("cosmetic comment change keeps norm_hash and changes body_hash", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/a.ts",
    `export function foo(): number {
  return 1;
}
`,
  );
  await buildIndex(root);
  let db = openDb(root);
  const before = db
    .prepare("SELECT body_hash AS body, norm_hash AS norm FROM nodes WHERE name = 'foo'")
    .get() as { body: string; norm: string };
  db.close();
  assert.ok(before.body);
  assert.ok(before.norm);

  write(
    root,
    "src/a.ts",
    `export function foo(): number {
  // only a comment
  return 1;
}
`,
  );
  await buildIndex(root);
  db = openDb(root);
  const after = db
    .prepare("SELECT body_hash AS body, norm_hash AS norm FROM nodes WHERE name = 'foo'")
    .get() as { body: string; norm: string };
  db.close();

  assert.equal(after.norm, before.norm, "structural hash ignores comments");
  assert.notEqual(after.body, before.body, "raw body hash sees the comment");
});

test("behavioural edit changes norm_hash", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/a.ts",
    `export function foo(): number {
  return 1;
}
`,
  );
  await buildIndex(root);
  let db = openDb(root);
  const before = db.prepare("SELECT norm_hash AS norm FROM nodes WHERE name = 'foo'").get() as {
    norm: string;
  };
  db.close();

  write(
    root,
    "src/a.ts",
    `export function foo(): number {
  return 2;
}
`,
  );
  await buildIndex(root);
  db = openDb(root);
  const after = db.prepare("SELECT norm_hash AS norm FROM nodes WHERE name = 'foo'").get() as {
    norm: string;
  };
  db.close();

  assert.notEqual(after.norm, before.norm);
});
