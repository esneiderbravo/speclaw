import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { churn, coChanges, logForPath, lastTouch, headSha } from "../../src/shared/git-history.js";

test("paths with spaces and unicode are reported whole, not split", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  const spaced = "src/my report card.ts";
  const unicode = "src/análisis-café.ts";
  commit(repo, "add awkward paths", [
    { path: spaced, content: "x\n" },
    { path: unicode, content: "y\n" },
  ]);

  const { byPath } = churn(repo);
  assert.equal(byPath.get(spaced), 1, "the spaced path is intact");
  assert.equal(byPath.get(unicode), 1, "the unicode path is intact");
  assert.equal(logForPath(repo, spaced).length, 1, "logForPath finds the spaced path");
  assert.match(lastTouch(repo, unicode) ?? "", /^[0-9a-f]{40}$/);
});

test("a repo with no commits yields empty, non-throwing results everywhere", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);

  assert.equal(headSha(repo), null);
  assert.deepEqual(logForPath(repo, "src/a.ts"), []);
  assert.equal(churn(repo).byPath.size, 0);
  assert.deepEqual(coChanges(repo).pairs, []);
  assert.equal(lastTouch(repo, "src/a.ts"), null);
});
