import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { logForPath } from "../../src/shared/git-history.js";

test("logForPath returns a path's commits newest-first with churn and timestamps", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  commit(repo, "two", [{ path: "src/a.ts", content: "a\nb\n" }]);
  const third = commit(repo, "three", [{ path: "src/a.ts", content: "a\nb\nc\n" }]);

  const touches = logForPath(repo, "src/a.ts");
  assert.equal(touches.length, 3, "three commits touched src/a.ts");
  assert.equal(touches[0]!.sha, third, "most-recent commit is first");
  for (const touch of touches) {
    assert.match(touch.sha, /^[0-9a-f]{40}$/);
    assert.ok(Number.isFinite(touch.ts) && touch.ts > 0, "has a numeric timestamp");
    assert.equal(typeof touch.added, "number");
    assert.equal(typeof touch.deleted, "number");
  }
  // Timestamps are non-increasing from newest to oldest.
  assert.ok(touches[0]!.ts >= touches[2]!.ts);
});

test("logForPath returns [] for a path that never existed and does not throw", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  assert.deepEqual(logForPath(repo, "src/never.ts"), []);
});

test("logForPath honors a since revision bound (exclusive)", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  const first = commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  const second = commit(repo, "two", [{ path: "src/a.ts", content: "a\nb\n" }]);
  const third = commit(repo, "three", [{ path: "src/a.ts", content: "a\nb\nc\n" }]);

  // `first..HEAD` excludes `first` itself and returns the two later commits.
  const since = logForPath(repo, "src/a.ts", { since: first });
  assert.deepEqual(
    since.map((c) => c.sha),
    [third, second],
    "only commits after `first`, newest-first",
  );
});

test("logForPath yields [] outside a git repository", (t) => {
  const plain = tmpRepo(t);
  assert.deepEqual(logForPath(plain, "src/a.ts"), []);
});
