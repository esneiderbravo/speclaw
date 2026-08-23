import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { seedSampleRepo, SAMPLE_MAIN_TS } from "../helpers/fixtures.js";
import { gitInit, commit } from "../helpers/git.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { diffContext } from "../../src/modules/compass/diff-context.js";

test("diffContext accepts explicit paths without git", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);
  const result = diffContext({ projectPath: root, paths: ["src/a.ts"] });
  assert.ok(result.changedFiles.includes("src/a.ts"));
});

test("diffContext resolves working-tree changes in a git repo", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  seedSampleRepo(root);
  commit(root, "baseline", [{ path: "src/main.ts", content: SAMPLE_MAIN_TS }]);
  await buildIndex(root);
  write(root, "src/main.ts", SAMPLE_MAIN_TS.replace("return x + 1", "return x + 2"));
  const result = diffContext({ projectPath: root });
  assert.ok(result.changedFiles.some((f) => f.includes("main.ts")));
});
