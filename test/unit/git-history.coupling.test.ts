import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { coChanges } from "../../src/shared/git-history.js";

test("coChanges counts commits that touch a pair of files together", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "both #1", [
    { path: "src/a.ts", content: "a\n" },
    { path: "src/b.ts", content: "b\n" },
  ]);
  commit(repo, "both #2", [
    { path: "src/a.ts", content: "a\na\n" },
    { path: "src/b.ts", content: "b\nb\n" },
  ]);
  commit(repo, "a alone", [{ path: "src/a.ts", content: "a\na\na\n" }]);

  const { pairs } = coChanges(repo);
  const ab = pairs.find((p) => p.a === "src/a.ts" && p.b === "src/b.ts");
  assert.ok(ab, "the (a, b) pair is present");
  assert.equal(ab!.count, 2, "a and b changed together in two commits");
});

test("coChanges omits pairs below minSupport", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "together once", [
    { path: "src/a.ts", content: "a\n" },
    { path: "src/b.ts", content: "b\n" },
  ]);

  assert.deepEqual(
    coChanges(repo, { minSupport: 2 }).pairs,
    [],
    "the single co-change is filtered",
  );
  assert.equal(coChanges(repo, { minSupport: 1 }).pairs.length, 1, "minSupport 1 keeps it");
});

test("coChanges is empty and non-throwing outside a git repository", (t) => {
  const plain = tmpRepo(t);
  const { shallow, pairs } = coChanges(plain);
  assert.equal(shallow, false);
  assert.deepEqual(pairs, []);
});
