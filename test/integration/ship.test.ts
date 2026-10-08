import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { readHarness } from "../../src/modules/cortex/harness.js";
import { handleLevel, scaffoldQuick } from "../../src/modules/lawbook/quick.js";
import { confirmedLevel } from "../../src/modules/lawbook/levels.js";
import {
  changeNameForBranch,
  docHint,
  measureBranchDiff,
  pendingArtifacts,
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
  const r = shipChange(root, "fix-x", { gates: [FAIL, PASS], summary: "fix x" });
  assert.equal(r.gatesPassed, false);
  assert.equal(r.gates.length, 1);
  assert.equal(r.gates[0].exitCode, 3);
  assert.equal(r.archivedTo, null);
  assert.match(r.next[0], /fix the failing gate/);
  const report = fs.readFileSync(path.join(root, r.report!), "utf8");
  assert.match(report, /FAIL \(exit 3\)/);
  assert.match(report, /boom/);
  assert.equal(readHarness(root, "fix-x"), null);
});

test("ship never records a review verdict and leaves level 1+ for the PR", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldQuick(root, "feat-y");
  handleLevel({ projectPath: root, change: "feat-y", mode: "promote", level: 1, reason: "test" });
  document(root, "feat-y");
  const r = shipChange(root, "feat-y", { gates: [PASS], summary: "feature y" });
  assert.deepEqual(r.pending, []);
  assert.equal(r.gatesPassed, true);
  assert.equal(r.archivedTo, null);
  assert.match(r.next[0], /review happens there/);
  assert.equal(readHarness(root, "feat-y"), null);

  const zero = shipChange(root, "fix-z", { gates: [PASS], date: "2026-10-07", summary: "z" });
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

/** Write the level-1+ artifacts an agent owes: record why, checked tasks, a real delta. */
function document(root: string, change: string): void {
  const dir = path.join(root, "lawbook", "changes", change);
  const record = path.join(dir, "record.md");
  if (fs.existsSync(record)) {
    fs.writeFileSync(
      record,
      fs.readFileSync(record, "utf8").replace("<!-- 2–5 lines: what and why. -->", "why: test"),
    );
  }
  for (const f of ["proposal.md", "design.md"]) {
    if (fs.existsSync(path.join(dir, f)))
      fs.writeFileSync(path.join(dir, f), `# ${f}\n\nWritten.\n`);
  }
  fs.writeFileSync(path.join(dir, "tasks.md"), "- [x] 1.1 Change the widget\n");
  fs.rmSync(path.join(dir, "specs"), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "specs", "widget"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "specs", "widget", "spec.md"),
    "# widget\n\n### Requirement: Widget\n\nThe system SHALL render the widget.\n",
  );
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
  assert.deepEqual(first.result.pending, [], "level 0 never waits on prose");
  assert.ok(first.result.archivedTo, JSON.stringify(first.result.next));
  const record = fs.readFileSync(path.join(root, first.result.archivedTo, "record.md"), "utf8");
  assert.match(record, /Changed 1 file\(s\): a\.js/, "no commit body: the file list stands in");
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });

  // More work on the same branch refreshes the archived report in place.
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 3;\n");
  const again = shipOnStop(root);
  assert.equal(again.skipped, null);
  if (again.skipped !== null) return;
  assert.equal(again.result.archivedTo, first.result.archivedTo);
  assert.ok(again.result.report?.startsWith(first.result.archivedTo!));
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
  const manual = shipChange(root, "fix-b-value-by-hand", { summary: "b by hand" });
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
  const first = shipChange(root, "first-change", { summary: "first" });
  assert.ok(first.archivedTo);
  const firstReport = path.join(root, first.archivedTo!, "reports", "change.md");
  const sealed = fs.readFileSync(firstReport, "utf8");

  // A second change on the same branch, shipped by name, then more work on it
  // (the same file, so the diff stays level 0).
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 81;\n");
  const second = shipChange(root, "second-change", { summary: "second" });
  assert.ok(second.archivedTo, JSON.stringify(second.next));
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 82;\n");
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
  shipChange(root, "d-value", { summary: "d" });
  const marker = path.join(root, ".speclaw", "ship-last");
  const { fingerprint } = JSON.parse(fs.readFileSync(marker, "utf8")) as { fingerprint: string };
  fs.writeFileSync(marker, fingerprint);
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });
});

/** Spread work over `modules` top-level folders under src/, `per` files each. */
function spread(root: string, modules: number, per: number, value = 1): void {
  for (let m = 0; m < modules; m++) {
    fs.mkdirSync(path.join(root, "src", `m${m}`), { recursive: true });
    for (let f = 0; f < per; f++) {
      fs.writeFileSync(path.join(root, "src", `m${m}`, `f${f}.js`), `export const v = ${value};\n`);
    }
  }
}

test("ship measures the branch diff: a multi-module change owes its artifacts before any gate", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/widget");
  spread(root, 5, 3);

  const owed = shipChange(root, "widget", { gates: [FAIL] });
  assert.deepEqual(owed.gates, [], "no gate runs while artifacts are owed");
  assert.equal(owed.report, null);
  const rec = JSON.parse(
    fs.readFileSync(path.join(root, "lawbook", "changes", "widget", "change.json"), "utf8"),
  ) as { confirmedLevel: number; confirmedBy: string };
  assert.equal(rec.confirmedBy, "measured");
  assert.ok(rec.confirmedLevel >= 1, `level ${rec.confirmedLevel}`);
  assert.match(owed.next[0], /^level \d .*document the change/);
  for (const f of ["record.md", "tasks.md", "specs/widget/spec.md"]) {
    assert.ok(
      owed.pending.some((p) => p.includes(f)),
      `${f} owed: ${owed.pending.join(" | ")}`,
    );
  }

  document(root, "widget");
  const shipped = shipChange(root, "widget", { gates: [PASS] });
  assert.deepEqual(shipped.pending, []);
  assert.equal(shipped.gatesPassed, true);
  assert.equal(shipped.archivedTo, null);
  assert.match(shipped.next[0], /review happens there/);
});

test("a release bump of package.json does not raise the measured level", (t) => {
  const root = gitFixture(t);
  fs.writeFileSync(path.join(root, "package.json"), '{\n  "name": "x",\n  "version": "1.0.0"\n}\n');
  git(root, "add", "-A");
  git(root, "commit", "-qm", "pkg");
  git(root, "checkout", "-qb", "chore/release-1-0-1");
  fs.writeFileSync(path.join(root, "package.json"), '{\n  "name": "x",\n  "version": "1.0.1"\n}\n');
  const r = shipChange(root, "release-1-0-1", {
    gates: [PASS],
    summary: "bump",
    date: "2026-10-07",
  });
  assert.ok(r.archivedTo, JSON.stringify(r.next));
  const rec = JSON.parse(fs.readFileSync(path.join(root, r.archivedTo, "change.json"), "utf8")) as {
    confirmedLevel: number;
  };
  assert.equal(rec.confirmedLevel, 0);
});

test("the branch's commit messages stand in for the record's why", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/e-value");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 11;\n");
  git(root, "add", "-A");
  git(
    root,
    "commit",
    "-qm",
    "fix(a): raise a to 11",
    "-m",
    "Callers divide by a; 10 overflowed the budget.",
    "-m",
    "Co-Authored-By: Bot <b@b>",
  );
  const hook = shipOnStop(root);
  assert.equal(hook.skipped, null);
  if (hook.skipped !== null) return;
  assert.ok(hook.result.archivedTo, JSON.stringify(hook.result.next));
  const record = fs.readFileSync(path.join(root, hook.result.archivedTo, "record.md"), "utf8");
  assert.match(record, /raise a to 11/);
  assert.match(record, /10 overflowed the budget/);
  assert.doesNotMatch(record, /Co-Authored-By/);
});

test("a change archived at level 0 on this branch reopens when the diff outgrows it", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/grows");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 12;\n");
  const small = shipChange(root, "grows", { gates: [PASS], summary: "small", date: "2026-10-07" });
  assert.ok(small.archivedTo);

  spread(root, 5, 3);
  const grown = shipOnStop(root);
  assert.equal(grown.skipped, null);
  if (grown.skipped !== null) return;
  assert.equal(grown.change, "grows");
  assert.equal(grown.result.archivedTo, null);
  assert.ok(grown.result.pending.length > 0);
  assert.ok(!fs.existsSync(path.join(root, small.archivedTo)), "the archive moved back");
  assert.ok(confirmedLevel(root, "grows") >= 1);
  assert.equal(readHarness(root, "grows"), null, "the finished harness is dropped");
});

test("an archive merged into the base is never reopened", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/merged");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 13;\n");
  const done = shipChange(root, "merged", { gates: [PASS], summary: "merged", date: "2026-10-07" });
  assert.ok(done.archivedTo);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "fix: merged");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--ff-only", "fix/merged");
  git(root, "checkout", "-qb", "feat/merged");
  spread(root, 5, 3);
  const r = shipChange(root, "merged", { gates: [PASS], summary: "later" });
  assert.equal(r.archivedTo, done.archivedTo, "the merged archive only gets its report refreshed");
  assert.ok(!fs.existsSync(path.join(root, "lawbook", "changes", "merged")));
});

test("a measured level in flight rises with the diff; a human-set level stands", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/flight");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 14;\n");
  shipChange(root, "flight", { gates: [PASS], noArchive: true });
  assert.equal(confirmedLevel(root, "flight"), 0);
  scaffoldQuick(root, "by-hand");

  spread(root, 5, 3);
  const grown = shipChange(root, "flight", { gates: [PASS] });
  assert.ok(confirmedLevel(root, "flight") >= 1);
  assert.ok(grown.pending.length > 0);

  const kept = shipChange(root, "by-hand", { gates: [PASS], date: "2026-10-07" });
  assert.ok(kept.archivedTo, JSON.stringify(kept.next));
  const rec = JSON.parse(
    fs.readFileSync(path.join(root, kept.archivedTo, "change.json"), "utf8"),
  ) as {
    confirmedLevel: number;
    confirmedBy: string;
  };
  assert.deepEqual([rec.confirmedLevel, rec.confirmedBy], [0, "human"]);
});

test("docHint tells a level 1+ change what it owes once, while the agent still works", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/hinted");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 15;\n");
  assert.equal(docHint(root), null, "unmeasured: the hook never waits");
  measureBranchDiff(root);
  assert.equal(docHint(root), null, "level 0 owes nothing");

  spread(root, 5, 3);
  assert.equal(docHint(root), null, "a new file set is measured in the background first");
  measureBranchDiff(root); // what the background job does
  const hint = docHint(root) ?? "";
  assert.match(hint, /measures level [1-3]/);
  assert.match(hint, /tasks\.md/);
  assert.ok(fs.existsSync(path.join(root, "lawbook", "changes", "hinted", "change.json")));
  assert.equal(docHint(root), null, "same files: no second hint");

  document(root, "hinted");
  const shipped = shipOnStop(root);
  assert.equal(shipped.skipped, null);
  if (shipped.skipped !== null) return;
  assert.deepEqual(shipped.result.pending, [], "written in the same turn: the stop is not blocked");
  assert.equal(shipped.result.gatesPassed, true);
});

test("a promoted change owes a real proposal, tasks and why, not the text the promotion seeded", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/seeded");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 16;\n");
  shipChange(root, "seeded", { gates: [PASS], noArchive: true });
  assert.equal(confirmedLevel(root, "seeded"), 0);

  spread(root, 5, 3);
  fs.writeFileSync(path.join(root, "package.json"), '{ "name": "x", "sideEffects": false }\n');
  const grown = shipChange(root, "seeded", { gates: [PASS] });
  assert.ok(confirmedLevel(root, "seeded") >= 2);
  for (const f of ["proposal.md", "tasks.md"]) {
    assert.ok(
      grown.pending.some((p) => p.includes(f)),
      `${f} owed: ${grown.pending.join(" | ")}`,
    );
  }
});

test("a written task that starts like a generated one is not a stub", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/real-tasks");
  spread(root, 5, 3);
  shipChange(root, "real-tasks", { gates: [PASS] });
  document(root, "real-tasks");
  fs.writeFileSync(
    path.join(root, "lawbook", "changes", "real-tasks", "tasks.md"),
    "- [x] Make the hook idempotent\n- [x] Make the fix visible in the report\n",
  );
  assert.deepEqual(pendingArtifacts(root, "real-tasks"), []);
});

test("a commit body with $-patterns lands in the record literally", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "fix/dollar");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 17;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "fix: keep $& and $' literal");
  const r = shipChange(root, "dollar", { gates: [PASS], date: "2026-10-07" });
  assert.ok(r.archivedTo);
  assert.match(
    fs.readFileSync(path.join(root, r.archivedTo, "record.md"), "utf8"),
    /keep \$& and \$' literal/,
  );
});

test("the edit hook's background job measures the diff without the hook waiting", async (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/background");
  spread(root, 5, 3);
  const start = Date.now();
  assert.equal(docHint(root), null);
  // Well under the hook's 5 s timeout, with room for a slow CI machine.
  assert.ok(Date.now() - start < 4000, "the hook call returns at once");
  const cache = path.join(root, ".speclaw", "level-cache.json");
  for (let i = 0; i < 150 && !fs.existsSync(cache); i++) {
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(fs.existsSync(cache), "the detached `speclaw measure-diff` wrote the cache");
  assert.match(docHint(root) ?? "", /measures level [1-3]/);
});

test("ship reuses the cached measurement of the same file set", (t) => {
  const root = gitFixture(t);
  git(root, "checkout", "-qb", "feat/cached");
  spread(root, 5, 3);
  measureBranchDiff(root);
  const cache = path.join(root, ".speclaw", "level-cache.json");
  const c = JSON.parse(fs.readFileSync(cache, "utf8")) as {
    proposal: { level: number; rationale: string };
  };
  // A different level than these files measure proves the stop did not re-measure.
  c.proposal.level = 3;
  c.proposal.rationale = "cached";
  fs.writeFileSync(cache, JSON.stringify(c));
  shipChange(root, "cached", { gates: [PASS] });
  assert.equal(confirmedLevel(root, "cached"), 3);
});

test("a regenerated Compass map is not work: the hook archives nothing on a fresh branch", (t) => {
  const root = gitFixture(t);
  const map = (body: string) =>
    `# Compass\n\nIntro.\n\n<!-- speclaw:map:start -->\n${body}\n<!-- speclaw:map:end -->\n`;
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "compass.md"), map("old map"));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "map");
  git(root, "checkout", "-qb", "feat/fresh");

  // A session start re-indexes and rewrites only the generated block.
  fs.writeFileSync(path.join(root, "docs", "compass.md"), map("new map\nmore"));
  assert.deepEqual(shipOnStop(root), { skipped: "no-changes" });
  assert.ok(!fs.existsSync(path.join(root, "lawbook", "changes", "fresh")));

  // CRLF on disk (core.autocrlf) is still only the map.
  fs.writeFileSync(path.join(root, "docs", "compass.md"), map("crlf map").replace(/\n/g, "\r\n"));
  assert.deepEqual(shipOnStop(root), { skipped: "no-changes" });

  // On a branch with real work, a re-index of the map is not new work either.
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 99;\n");
  assert.equal(
    shipChange(root, "fresh", { gates: [PASS], summary: "real work" }).gatesPassed,
    true,
  );
  fs.writeFileSync(path.join(root, "docs", "compass.md"), map("re-indexed again"));
  assert.deepEqual(shipOnStop(root), { skipped: "unchanged-since-last-ship" });

  // An edit outside the block is real work.
  fs.writeFileSync(
    path.join(root, "docs", "compass.md"),
    map("new map").replace("Intro.", "Intro, edited."),
  );
  assert.equal(shipOnStop(root).skipped, null);
});
