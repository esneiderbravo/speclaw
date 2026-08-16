import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { changedFiles, mergeBase } from "../../src/shared/git.js";

test("mergeBase is null outside a git repo or for an unknown ref", (t) => {
  const plain = tmpRepo(t);
  assert.equal(mergeBase(plain, "HEAD"), null);

  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "a.ts", content: "a\n" }]);
  assert.equal(mergeBase(repo, "no-such-ref"), null);
});

test("mergeBase of an ancestor SHA and HEAD is that ancestor", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  const first = commit(repo, "one", [{ path: "a.ts", content: "a\n" }]);
  commit(repo, "two", [{ path: "b.ts", content: "b\n" }]);
  assert.equal(mergeBase(repo, first), first);
});

test("changedFiles lists paths added or modified since the base", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  const first = commit(repo, "one", [{ path: "a.ts", content: "a\n" }]);
  commit(repo, "two", [
    { path: "a.ts", content: "a\nb\n" },
    { path: "b.ts", content: "b\n" },
  ]);
  const files = changedFiles(repo, first).sort();
  assert.deepEqual(files, ["a.ts", "b.ts"]);
});

test("changedFiles is empty when the merge base cannot be resolved", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "a.ts", content: "a\n" }]);
  assert.deepEqual(changedFiles(repo, "no-such-ref"), []);
});
