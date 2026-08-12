import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { churn, coChanges, isShallowRepo } from "../../src/shared/git-history.js";

/** Clone `src` into `<parent>/shallow` with depth 1 and return the clone path. */
function shallowClone(src: string, parent: string): string {
  const dest = path.join(parent, "shallow");
  // A file:// URL forces a real (shallow-capable) clone rather than a hardlink.
  spawnSync("git", ["clone", "--depth=1", "-q", `file://${src}`, dest], { encoding: "utf8" });
  return dest;
}

test("a full clone is not flagged shallow and its scans report shallow: false", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  commit(repo, "two", [
    { path: "src/a.ts", content: "a\nb\n" },
    { path: "src/b.ts", content: "b\n" },
  ]);

  assert.equal(isShallowRepo(repo), false);
  assert.equal(churn(repo).shallow, false);
  assert.equal(coChanges(repo).shallow, false);
});

test("a --depth=1 clone is flagged shallow and both scans carry shallow: true", (t) => {
  const origin = tmpRepo(t);
  gitInit(origin);
  commit(origin, "one", [{ path: "src/a.ts", content: "a\n" }]);
  commit(origin, "two", [
    { path: "src/a.ts", content: "a\nb\n" },
    { path: "src/b.ts", content: "b\n" },
  ]);

  const parent = tmpRepo(t);
  const shallow = shallowClone(origin, parent);

  assert.equal(isShallowRepo(shallow), true, "the clone is shallow");
  assert.equal(churn(shallow).shallow, true, "churn propagates the marker");
  assert.equal(coChanges(shallow).shallow, true, "coChanges propagates the marker");
});
