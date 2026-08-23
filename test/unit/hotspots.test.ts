import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { coChanges, fileActivity, jaccardStrength } from "../../src/shared/git-history.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { write } from "../helpers/env.js";
import { coupling, hotspots, sinceDaysAgo } from "../../src/modules/compass/hotspots.js";

test("fileActivity reports commits, lines, and distinct authors", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "a1", [{ path: "src/a.ts", content: "a\n" }], { name: "Alice", email: "a@ex.com" });
  commit(repo, "a2", [{ path: "src/a.ts", content: "a\nb\nc\n" }], {
    name: "Bob",
    email: "b@ex.com",
  });
  const act = fileActivity(repo).byPath.get("src/a.ts")!;
  assert.equal(act.commits, 2);
  assert.ok(act.linesAdded >= 2);
  assert.equal(act.authors, 2);
});

test("coChanges skips oversized commits when maxFilesPerCommit is set", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  const many = Array.from({ length: 60 }, (_, i) => ({
    path: `f${i}.ts`,
    content: `export const n${i} = ${i};\n`,
  }));
  commit(repo, "giant", many);
  commit(repo, "pair", [
    { path: "f0.ts", content: "export const n0 = 99;\n" },
    { path: "f1.ts", content: "export const n1 = 99;\n" },
  ]);
  const withCap = coChanges(repo, { maxFilesPerCommit: 50, minSupport: 1 });
  assert.ok((withCap.skippedTooLarge ?? 0) >= 1);
  const pair = withCap.pairs.find((p) => p.a === "f0.ts" && p.b === "f1.ts");
  assert.ok(pair);
  assert.equal(pair!.count, 1, "only the non-giant commit counts");

  const uncapped = coChanges(repo, { minSupport: 1 });
  const pair2 = uncapped.pairs.find((p) => p.a === "f0.ts" && p.b === "f1.ts");
  assert.equal(pair2!.count, 2, "without cap both commits count");
});

test("jaccardStrength is both / (a+b-both)", () => {
  assert.equal(jaccardStrength(2, 3, 4), 2 / 5);
  assert.equal(jaccardStrength(0, 0, 0), 0);
});

test("sinceDaysAgo labels roughly 90 days", () => {
  const since = sinceDaysAgo(90, new Date("2026-08-22T12:00:00Z"));
  assert.equal(since, "2026-05-24");
});

test("hotspots ranks high-churn complex file above quiet clean file", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  write(
    root,
    "src/hot.ts",
    `export function hot(n: number): number {
  if (n > 0) {
    if (n > 1 && n < 9) return n;
  }
  return 0;
}
`,
  );
  write(root, "src/cold.ts", `export function cold(): number { return 1; }\n`);
  commit(root, "init", [
    { path: "src/hot.ts", content: "export function hot(): number { return 0; }\n" },
    { path: "src/cold.ts", content: "export function cold(): number { return 1; }\n" },
  ]);
  for (let i = 0; i < 4; i++) {
    commit(root, `hot ${i}`, [
      {
        path: "src/hot.ts",
        content: `export function hot(n: number): number {
  if (n > ${i}) {
    if (n > 1 && n < 9) return n;
  }
  return ${i};
}
`,
      },
    ]);
  }
  await buildIndex(root);
  const report = hotspots(root, { days: 90, sortBy: "combined", limit: 10 });
  assert.match(report.window.label, /90/);
  const files = report.hotspots.map((h) => h.file);
  assert.ok(files.includes("src/hot.ts"));
  assert.ok(
    files.indexOf("src/hot.ts") < files.indexOf("src/cold.ts") || !files.includes("src/cold.ts"),
  );
  const hot = report.hotspots.find((h) => h.file === "src/hot.ts")!;
  assert.ok(hot.activity.commits >= 4);
  assert.ok(hot.health);
  assert.ok(hot.health!.worstBranches > 0);
});

test("coupling marks test pairs and excludes giant-only co-change", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  write(root, "src/foo.ts", `export function foo(): number { return 1; }\n`);
  write(root, "src/foo.test.ts", `export function t(): void {}\n`);
  write(root, "src/other.ts", `export function other(): number { return 2; }\n`);
  commit(root, "base", [
    { path: "src/foo.ts", content: "export function foo(): number { return 1; }\n" },
    { path: "src/foo.test.ts", content: "export function t(): void {}\n" },
    { path: "src/other.ts", content: "export function other(): number { return 2; }\n" },
  ]);
  commit(root, "pair1", [
    { path: "src/foo.ts", content: "export function foo(): number { return 2; }\n" },
    { path: "src/foo.test.ts", content: "export function t(): void { /*1*/ }\n" },
  ]);
  commit(root, "pair2", [
    { path: "src/foo.ts", content: "export function foo(): number { return 3; }\n" },
    { path: "src/foo.test.ts", content: "export function t(): void { /*2*/ }\n" },
  ]);
  const giant = Array.from({ length: 55 }, (_, i) => ({
    path: `bulk/f${i}.ts`,
    content: `export const x${i} = ${i};\n`,
  }));
  giant.push(
    { path: "src/foo.ts", content: "export function foo(): number { return 4; }\n" },
    { path: "src/other.ts", content: "export function other(): number { return 9; }\n" },
  );
  commit(root, "giant", giant);

  await buildIndex(root);
  const report = coupling(root, "src/foo.ts", { days: 3650, minShared: 2 });
  const testPartner = report.partners.find((p) => p.file === "src/foo.test.ts");
  assert.ok(testPartner, "test partner present");
  assert.equal(testPartner!.isTestPair, true);
  assert.ok(testPartner!.strength > 0);
  assert.ok(!report.partners.some((p) => p.file === "src/other.ts"), "giant-only pair filtered");
  assert.ok(report.diagnostics.skippedTooLarge >= 1);
});

test("weak single co-commit is filtered by default minShared", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  commit(root, "once", [
    { path: "src/a.ts", content: "export const a = 1;\n" },
    { path: "src/b.ts", content: "export const b = 1;\n" },
  ]);
  await buildIndex(root);
  const report = coupling(root, "src/a.ts", { days: 3650 });
  assert.equal(report.partners.length, 0);
});
