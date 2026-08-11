import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpRepo, write } from "../helpers/env.js";
import { isGitRepo, listTrackedPaths } from "../../src/shared/git.js";

/** Initialise a git repo in `dir` (index only — no commit/user config needed). */
function gitInit(dir: string): void {
  spawnSync("git", ["-C", dir, "init", "-q"], { encoding: "utf8" });
}

/** Stage `paths` into the repo's index so `git ls-files` reports them. */
function gitAdd(dir: string, ...paths: string[]): void {
  spawnSync("git", ["-C", dir, "add", "--", ...paths], { encoding: "utf8" });
}

test("isGitRepo is true inside a git work tree and false outside one", (t) => {
  const plain = tmpRepo(t);
  assert.equal(isGitRepo(plain), false);

  const repo = tmpRepo(t);
  gitInit(repo);
  assert.equal(isGitRepo(repo), true);
});

test("listTrackedPaths returns [] outside a git repository", (t) => {
  const plain = tmpRepo(t);
  write(plain, "ai-specs/skills/x.md", "x");
  assert.deepEqual(listTrackedPaths(plain, ["ai-specs", ".claude/skills"]), []);
});

test("listTrackedPaths reports only the candidates git actually tracks", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  write(repo, "ai-specs/skills/x.md", "x");
  write(repo, ".claude/settings.json", "{}");
  gitAdd(repo, "ai-specs", ".claude/settings.json");

  // ai-specs is tracked (a file under it is staged); .claude/skills is not.
  assert.deepEqual(listTrackedPaths(repo, ["ai-specs", ".claude/skills"]), ["ai-specs"]);
});

test("listTrackedPaths returns [] when none of the candidates are tracked", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  write(repo, "ai-specs/skills/x.md", "x"); // present but never `git add`-ed
  assert.deepEqual(listTrackedPaths(repo, ["ai-specs"]), []);
});
