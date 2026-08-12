import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { lastTouch, headSha } from "../../src/shared/git-history.js";

test("lastTouch returns the SHA of the most recent commit touching a path", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  const second = commit(repo, "two", [{ path: "src/a.ts", content: "a\nb\n" }]);
  // A later commit that does NOT touch a.ts must not become its last touch.
  commit(repo, "unrelated", [{ path: "src/b.ts", content: "b\n" }]);

  assert.equal(lastTouch(repo, "src/a.ts"), second);
});

test("lastTouch returns null for a path with no history", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  assert.equal(lastTouch(repo, "src/never.ts"), null);
});

test("headSha returns the HEAD commit, or null before any commit", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  assert.equal(headSha(repo), null, "no commits yet");
  const sha = commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  assert.equal(headSha(repo), sha);
});
