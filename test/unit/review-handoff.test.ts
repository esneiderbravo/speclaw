import { test } from "node:test";
import { RETIRED_NAMES } from "../../src/shared/tool-catalog.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpRepo, write, read } from "../helpers/env.js";
import { commit, gitInit } from "../helpers/git.js";
import {
  REVIEW_CHECKLIST,
  REVIEW_MAX_LINES,
  buildReviewHandoff,
  renderReviewPrompt,
} from "../../src/modules/cortex/review.js";
import { registerCortex } from "../../src/modules/cortex/register.js";
import { handleHarness } from "../../src/modules/cortex/harness.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { captureTools, type McpTextResult } from "../helpers/contracts.js";

const ASSETS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/lawbook/assets",
);
const reviewerAsset = fs.readFileSync(path.join(ASSETS, "agents/reviewer.md"), "utf8");

test("the reviewer agent lists every defect class the harness prompt checks", () => {
  for (const item of REVIEW_CHECKLIST) assert.ok(reviewerAsset.includes(item), item);
  assert.match(reviewerAsset, /compass_diff_context/);
  assert.match(reviewerAsset, /at most 40 lines/);
  assert.match(reviewerAsset, /Verdict: PASS \| FAIL/);
  const loop = fs.readFileSync(
    path.join(ASSETS, "skills/cortex/steps/02-dispatch-loop.md"),
    "utf8",
  );
  assert.match(loop, /Reviewer template/);
  assert.match(loop, /review\.prompt/);
});

test("the reviewer agent stays agent-agnostic and uses canonical tools only", () => {
  const frontmatter = reviewerAsset.split("---")[1] ?? "";
  assert.doesNotMatch(frontmatter, /^model:/m);
  for (const name of RETIRED_NAMES) assert.ok(!reviewerAsset.includes(name), name);
});

test("renderReviewPrompt scopes the review to the diff with the fixed format", () => {
  const prompt = renderReviewPrompt("feat", ".speclaw/review/feat.diff", ["src/a.ts"]);
  assert.match(prompt, /\.speclaw\/review\/feat\.diff` \(1 file\(s\)\)/);
  assert.match(prompt, /compass_diff_context/);
  assert.match(prompt, /Do not read whole files/);
  assert.match(prompt, new RegExp(`at most ${REVIEW_MAX_LINES} lines`));
  assert.match(prompt, /lawbook\/changes\/feat\/reports\/review\.md/);
  for (const item of REVIEW_CHECKLIST) assert.ok(prompt.includes(item), item);
  for (const name of RETIRED_NAMES) assert.ok(!prompt.includes(name), name);

  const noBase = renderReviewPrompt("feat", null, []);
  assert.match(noBase, /No merge base was found/);
});

test("buildReviewHandoff exports committed, uncommitted and untracked work", (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  spawnSync("git", ["-C", root, "checkout", "-q", "-b", "main"]);
  commit(root, "base", [{ path: "src/a.ts", content: "export const a = 1;\n" }]);
  spawnSync("git", ["-C", root, "checkout", "-q", "-b", "feat/x"]);
  commit(root, "work", [{ path: "src/b.ts", content: "export const b = 2;\n" }]);
  write(root, "src/a.ts", "export const a = 3;\n");
  write(root, "test/c.test.ts", "// new test\n");
  write(root, ".speclaw/index.db", "binary");

  const handoff = buildReviewHandoff(root, "feat");
  assert.equal(handoff.diffPath, ".speclaw/review/feat.diff");
  assert.ok(handoff.base);
  assert.deepEqual(handoff.files, ["src/a.ts", "src/b.ts", "test/c.test.ts"]);
  assert.equal(handoff.reportPath, "lawbook/changes/feat/reports/review.md");
  const diff = read(root, ".speclaw/review/feat.diff");
  assert.match(diff, /\+export const a = 3;/);
  assert.match(diff, /\+export const b = 2;/);
  assert.match(diff, /\+\/\/ new test/);
  assert.doesNotMatch(diff, /index\.db/);
  assert.match(handoff.prompt, /3 file\(s\)/);
});

test("buildReviewHandoff degrades to compass_diff_context without a git base", (t) => {
  const root = tmpRepo(t);
  const handoff = buildReviewHandoff(root, "feat");
  assert.equal(handoff.diffPath, null);
  assert.equal(handoff.base, null);
  assert.deepEqual(handoff.files, []);
  assert.match(handoff.prompt, /No merge base was found/);
});

test("cortex brief at reviewing returns the review handoff; other stages do not", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  spawnSync("git", ["-C", root, "checkout", "-q", "-b", "main"]);
  commit(root, "base", [{ path: "src/a.ts", content: "export const a = 1;\n" }]);
  specInit(root);
  write(root, "lawbook/changes/feat/proposal.md", "# p\n");
  write(root, "lawbook/changes/feat/tasks.md", "- [x] x\n");
  write(
    root,
    "lawbook/changes/feat/change.json",
    JSON.stringify({
      confirmedLevel: 2,
      confirmedBy: "human",
      confirmedAt: new Date().toISOString(),
      level: 2,
      score: 0,
      signals: {},
      rationale: "test",
      degraded: [],
      promotions: [],
    }),
  );
  write(root, "src/a.ts", "export const a = 2;\n");
  const brief = async () => {
    const out = (await captureTools(registerCortex)
      .get("cortex")!
      .handler({ projectPath: root, change: "feat", action: "brief" })) as McpTextResult;
    return JSON.parse(out.content[0]!.text) as { role: string; review?: { diffPath: string } };
  };

  handleHarness({ projectPath: root, change: "feat", harnessOp: "start" });
  assert.equal((await brief()).review, undefined);
  for (let i = 0; i < 3; i++) {
    handleHarness({ projectPath: root, change: "feat", harnessOp: "advance" });
  }
  const reviewing = await brief();
  assert.equal(reviewing.role, "reviewer");
  assert.equal(reviewing.review?.diffPath, ".speclaw/review/feat.diff");
  assert.match(read(root, ".speclaw/review/feat.diff"), /\+export const a = 2;/);
});
