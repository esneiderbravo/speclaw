import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { readHarness } from "../../src/modules/cortex/harness.js";
import { handleLevel, scaffoldQuick } from "../../src/modules/lawbook/quick.js";
import {
  changeNameForBranch,
  detectGates,
  readShipConfig,
  shipChange,
  shipOnStop,
} from "../../src/modules/lawbook/ship.js";

const PASS = `node -e "process.exit(0)"`;
const FAIL = `node -e "console.log('boom'); process.exit(3)"`;

test("ship on passing gates scaffolds, reports from real output, and archives a new change", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const r = shipChange(root, "fix-typo", {
    gates: [PASS],
    summary: "typo in greeting",
    date: "2026-10-07",
  });
  assert.equal(r.gatesPassed, true);
  assert.equal(r.archivedTo, "lawbook/changes/archive/2026-10-07-fix-typo");
  const archived = path.join(root, r.archivedTo);
  const report = fs.readFileSync(path.join(archived, "reports", "change.md"), "utf8");
  assert.match(report, /\| `node -e "process.exit\(0\)"` \| pass \|/);
  assert.match(report, /Review is not decided here/);
  assert.match(fs.readFileSync(path.join(archived, "record.md"), "utf8"), /typo in greeting/);
  assert.ok(r.timings.overhead >= 0 && r.timings.total >= r.timings.gates);
});

test("ship stops on the first failing gate and archives nothing", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const r = shipChange(root, "fix-x", { gates: [FAIL, PASS] });
  assert.equal(r.gatesPassed, false);
  assert.equal(r.gates.length, 1);
  assert.equal(r.gates[0].exitCode, 3);
  assert.equal(r.archivedTo, null);
  assert.match(r.next[0], /fix the failing gate/);
  const report = fs.readFileSync(path.join(root, r.report), "utf8");
  assert.match(report, /FAIL \(exit 3\)/);
  assert.match(report, /boom/);
  assert.equal(readHarness(root, "fix-x"), null);
});

test("ship never records a review verdict and leaves level 1+ for the PR", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldQuick(root, "feat-y");
  handleLevel({ projectPath: root, change: "feat-y", mode: "promote", level: 1, reason: "test" });
  const r = shipChange(root, "feat-y", { gates: [PASS] });
  assert.equal(r.gatesPassed, true);
  assert.equal(r.archivedTo, null);
  assert.match(r.next[0], /review happens there/);
  assert.equal(readHarness(root, "feat-y"), null);

  const zero = shipChange(root, "fix-z", { gates: [PASS], date: "2026-10-07" });
  assert.ok(zero.archivedTo);
  const harness = JSON.parse(
    fs.readFileSync(path.join(root, zero.archivedTo, "harness.json"), "utf8"),
  ) as { verdicts: { review: string | null; test: string | null } };
  assert.equal(harness.verdicts.review, null);
  assert.equal(harness.verdicts.test, "PASS");
});

test("ship reads gates and discipline from config, else package.json scripts", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  assert.deepEqual(detectGates(root), []);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ scripts: { lint: "x", check: "x", build: "x", test: "x" } }),
  );
  assert.deepEqual(detectGates(root), ["npm run check", "npm run build", "npm test"]);
  fs.appendFileSync(
    path.join(root, "lawbook", "config.yaml"),
    `\nship:\n  gates: ["npm run check", 'npm test']\n  discipline: backend\nother: 1\n`,
  );
  assert.deepEqual(readShipConfig(root), {
    gates: ["npm run check", "npm test"],
    discipline: "backend",
  });
});

function git(root: string, ...args: string[]): void {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function gitFixture(t: Parameters<typeof tmpRepo>[0]): string {
  const root = tmpRepo(t);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  specInit(root);
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 1;\n");
  fs.writeFileSync(
    path.join(root, "lawbook", "config.yaml"),
    fs.readFileSync(path.join(root, "lawbook", "config.yaml"), "utf8") +
      `\nship:\n  gates: ["node -v"]\n`,
  );
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  return root;
}

// Covers: req~ship-on-stop-hook~1
test("shipOnStop skips the base branch and unchanged work, ships changed work once", (t) => {
  const root = gitFixture(t);
  assert.deepEqual(shipOnStop(root), { skipped: "base-branch" });
  git(root, "checkout", "-qb", "fix/a-value");
  assert.deepEqual(shipOnStop(root), { skipped: "no-changes" });

  fs.writeFileSync(path.join(root, "a.js"), "export const a = 2;\n");
  const first = shipOnStop(root);
  assert.equal(first.skipped, null);
  if (first.skipped !== null) return;
  assert.equal(first.change, "a-value");
  assert.ok(first.result.archivedTo, JSON.stringify(first.result.next));
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });

  // More work on the same branch refreshes the archived report in place.
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 3;\n");
  const again = shipOnStop(root);
  assert.equal(again.skipped, null);
  if (again.skipped !== null) return;
  assert.equal(again.result.archivedTo, first.result.archivedTo);
  assert.ok(again.result.report.startsWith(first.result.archivedTo!));
});

test("changeNameForBranch keeps the last segment, kebab-cased", () => {
  assert.equal(changeNameForBranch("fix/compass-query-output"), "compass-query-output");
  assert.equal(changeNameForBranch("feat/FAR-12_Add Thing"), "far-12-add-thing");
  assert.equal(changeNameForBranch("///"), "change");
});

test("a manual ship marks the work shipped, so the Stop hook does not ship it twice", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/b-value");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 5;\n");
  const manual = shipChange(root, "fix-b-value-by-hand");
  assert.ok(manual.archivedTo);
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });
});

test("committing shipped work is not new work for the Stop hook", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/c-value");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 7;\n");
  const first = shipOnStop(root);
  assert.equal(first.skipped, null);
  git(root, "add", "a.js");
  git(root, "commit", "-qm", "fix: c value");
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });
});

test("committing a new file is not new work for the Stop hook", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/new-file");
  fs.writeFileSync(path.join(root, "b.js"), "export const b = 1;\n");
  const first = shipOnStop(root);
  assert.equal(first.skipped, null);
  if (first.skipped !== null) return;
  assert.ok(first.result.archivedTo, JSON.stringify(first.result.next));
  const report = path.join(root, first.result.archivedTo, "reports", "change.md");
  const shipped = fs.readFileSync(report, "utf8");
  assert.match(shipped, /- `b\.js`/, "the report lists the new file");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "feat: b");
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });
  assert.equal(fs.readFileSync(report, "utf8"), shipped, "report untouched");
});

test("the Stop hook keeps the change last shipped by name and never rewrites another archive", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/first-change");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 8;\n");
  const first = shipChange(root, "first-change");
  assert.ok(first.archivedTo);
  const firstReport = path.join(root, first.archivedTo!, "reports", "change.md");
  const sealed = fs.readFileSync(firstReport, "utf8");

  // A second change on the same branch, shipped by name, then more work on it.
  fs.writeFileSync(path.join(root, "b.js"), "export const b = 1;\n");
  const second = shipChange(root, "second-change");
  assert.ok(second.archivedTo);
  fs.writeFileSync(path.join(root, "b.js"), "export const b = 2;\n");
  const hook = shipOnStop(root);
  assert.equal(hook.skipped, null);
  if (hook.skipped !== null) return;
  assert.equal(hook.change, "second-change");
  assert.equal(fs.readFileSync(firstReport, "utf8"), sealed, "first archive untouched");
});

test("a legacy fingerprint-only marker still skips unchanged work", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/d-value");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 9;\n");
  shipChange(root, "d-value");
  const marker = path.join(root, ".speclaw", "ship-last");
  const { fingerprint } = JSON.parse(fs.readFileSync(marker, "utf8")) as { fingerprint: string };
  fs.writeFileSync(marker, fingerprint);
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });
});
