// Covers: req~feature-draft~1
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CHANGE_NAME_RE,
  PLACEHOLDER_DELTA_MARKER,
  featureStubs,
  isPlaceholderDelta,
  scaffoldFeature,
} from "../../src/modules/lawbook/scaffold-change.js";
import { scaffoldQuick, handleLevel } from "../../src/modules/lawbook/quick.js";
import { scaffoldBugfix } from "../../src/modules/lawbook/bugfix.js";
import {
  confirmedLevel,
  readCeremonyRecord,
  readChangeType,
} from "../../src/modules/lawbook/levels.js";
import { specInit, specSync, specValidate } from "../../src/modules/lawbook/engine.js";
import { handleLawbookChange } from "../../src/modules/lawbook/change-tool.js";
import { tmpRepo, has, read } from "../helpers/env.js";

/** Files under a change dir, relative and sorted (directories excluded). */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out.push(path.relative(dir, abs).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

const SPEC = "specs/add-widget/spec.md";
const STUBS: Record<0 | 1 | 2 | 3, string[]> = {
  0: ["change.json", "record.md", "reports/README.md"],
  1: ["change.json", "record.md", "reports/README.md", SPEC, "tasks.md"],
  2: ["change.json", "design.md", "proposal.md", "reports/README.md", SPEC, "tasks.md"],
  3: ["change.json", "design.md", "proposal.md", "reports/README.md", SPEC, "tasks.md"],
};

for (const level of [0, 1, 2, 3] as const) {
  test(`feature draft at level ${level} writes exactly that level's stubs`, (t) => {
    const root = tmpRepo(t);
    specInit(root);
    const r = scaffoldFeature(root, "add-widget", { level });
    const dir = path.join(root, "lawbook", "changes", "add-widget");
    assert.deepEqual(listFiles(dir), STUBS[level]);
    assert.equal(r.level, level);
    assert.equal(r.changeType, "feature");
    const rec = readCeremonyRecord(root, "add-widget");
    assert.equal(rec?.confirmedLevel, level);
    assert.equal(rec?.changeType, "feature");
    assert.equal(readChangeType(root, "add-widget"), "feature");
    assert.ok(!has(dir, "bugfix.md"));
  });
}

test("feature draft without a level leaves the level unconfirmed (validate uses 3)", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const r = scaffoldFeature(root, "add-widget");
  const dir = path.join(root, "lawbook", "changes", "add-widget");
  assert.deepEqual(listFiles(dir), ["change.json", "reports/README.md"]);
  assert.equal(r.level, null);
  const raw = JSON.parse(read(dir, "change.json")) as Record<string, unknown>;
  assert.equal(raw.confirmedLevel, undefined);
  assert.equal(raw.changeType, "feature");
  assert.ok("score" in raw && "rationale" in raw, "proposal fields recorded");
  assert.equal(confirmedLevel(root, "add-widget"), 3);
  const v = specValidate(root, "add-widget");
  assert.ok(v.issues.some((i) => /required at ceremony level 3/.test(i)));
});

test("level set on an unconfirmed draft confirms it and keeps the change type", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldFeature(root, "add-widget");
  handleLevel({ projectPath: root, mode: "set", change: "add-widget", level: 1 });
  const rec = readCeremonyRecord(root, "add-widget");
  assert.equal(rec?.confirmedLevel, 1);
  assert.equal(rec?.changeType, "feature");
});

test("an existing change directory is refused without modifying it", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldFeature(root, "add-widget", { level: 2 });
  const dir = path.join(root, "lawbook", "changes", "add-widget");
  const before = listFiles(dir).map((f) => [f, read(dir, f)]);
  assert.throws(() => scaffoldFeature(root, "add-widget", { level: 3 }), /already exists/);
  assert.deepEqual(
    listFiles(dir).map((f) => [f, read(dir, f)]),
    before,
  );
});

test("a non-kebab-case name is refused without writing", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  for (const bad of ["Add_Widget", "add widget", "../escape", "add--widget", "-x", ""]) {
    assert.ok(!CHANGE_NAME_RE.test(bad), bad);
    assert.throws(() => scaffoldFeature(root, bad, { level: 0 }), /kebab-case/);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, "lawbook", "changes")), ["archive"]);
});

test("featureStubs returns nothing when the level is unconfirmed", () => {
  const proposal = {
    level: 0 as const,
    score: 0,
    signals: {} as never,
    rationale: "r",
    degraded: [],
  };
  assert.deepEqual(featureStubs("x", undefined, proposal), {});
});

test("quick output is unchanged by the shared scaffold", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const r = scaffoldQuick(root, "fix-typo");
  assert.deepEqual(Object.keys(r).sort(), ["change", "dir", "proposal", "record"]);
  const dir = path.join(root, "lawbook", "changes", "fix-typo");
  assert.deepEqual(listFiles(dir), ["change.json", "record.md", "reports/README.md"]);
  assert.equal(
    read(dir, "reports/README.md"),
    "# Reports — fix-typo\n\nAdd at least one discipline report before archive.\n",
  );
  assert.match(read(dir, "record.md"), /^# fix-typo\n\n\*\*Level:\*\* 0 \(proposed: /);
  assert.match(read(dir, "record.md"), /- \[ \] Make the fix\n/);
  const raw = JSON.parse(read(dir, "change.json")) as Record<string, unknown>;
  assert.equal(raw.confirmedLevel, 0);
  assert.equal(raw.confirmedBy, "human");
  assert.equal("changeType" in raw, false, "quick does not write changeType");
  assert.deepEqual(Object.keys(raw).slice(-4), [
    "confirmedLevel",
    "confirmedBy",
    "confirmedAt",
    "promotions",
  ]);
});

test("bug draft output is unchanged by the shared scaffold", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const r = scaffoldBugfix(root, "dup-charge", { level: 2 });
  assert.deepEqual(Object.keys(r).sort(), ["change", "dir", "proposal", "record"]);
  const dir = path.join(root, "lawbook", "changes", "dup-charge");
  assert.deepEqual(listFiles(dir), [
    "bugfix.md",
    "change.json",
    "design.md",
    "reports/README.md",
    "tasks.md",
  ]);
  assert.match(read(dir, "reports/README.md"), /failing before the fix/);
  const raw = JSON.parse(read(dir, "change.json")) as Record<string, unknown>;
  assert.equal(raw.changeType, "bug");
  assert.equal(raw.confirmedLevel, 2);
  assert.deepEqual(Object.keys(raw).slice(-2), ["promotions", "changeType"]);
});

test("lawbook_change draft dispatches feature and bug scaffolds", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const f = handleLawbookChange({
    projectPath: root,
    action: "draft",
    change: "add-widget",
    level: 2,
  }) as { changeType: string; level: number };
  assert.equal(f.changeType, "feature");
  assert.equal(f.level, 2);
  handleLawbookChange({ projectPath: root, action: "draft", change: "dup-charge", bug: true });
  assert.equal(readChangeType(root, "dup-charge"), "bug");
  assert.throws(
    () => handleLawbookChange({ projectPath: root, action: "draft" }),
    /requires 'change'/,
  );
});

for (const level of [0, 1, 2, 3] as const) {
  test(`a fresh level-${level} feature draft passes validate out of the box`, (t) => {
    const root = tmpRepo(t);
    specInit(root);
    scaffoldFeature(root, "add-widget", { level });
    const v = specValidate(root, "add-widget");
    assert.deepEqual(v.issues, []);
    assert.equal(v.valid, true);
  });
}

test("the delta stub starts from an existing canonical capability spec", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const canonical =
    "# Widgets\n\n### Requirement: Render\nThe system SHALL render widgets.\n\n" +
    "#### Scenario: r\n- Given a widget\n- When shown\n- Then it renders\n";
  fs.mkdirSync(path.join(root, "lawbook", "specs", "widgets"), { recursive: true });
  fs.writeFileSync(path.join(root, "lawbook", "specs", "widgets", "spec.md"), canonical);
  scaffoldFeature(root, "add-widget", { level: 2, capability: "widgets" });
  const dir = path.join(root, "lawbook", "changes", "add-widget");
  assert.equal(read(dir, "specs/widgets/spec.md"), canonical);
  assert.ok(!has(dir, "specs/add-widget/spec.md"));
  assert.equal(specValidate(root, "add-widget").valid, true);
});

test("a non-kebab-case capability is refused without writing", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  assert.throws(
    () => scaffoldFeature(root, "add-widget", { level: 2, capability: "../x" }),
    /capability .* kebab-case/,
  );
  assert.ok(!has(root, "lawbook/changes/add-widget"));
});

test("quick and bug drafts keep accepting non-kebab names (unchanged outputs)", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldQuick(root, "FAR-2199-fix");
  scaffoldBugfix(root, "dup_charge", { level: 0 });
  assert.ok(has(root, "lawbook/changes/FAR-2199-fix/record.md"));
  assert.ok(has(root, "lawbook/changes/dup_charge/bugfix.md"));
  assert.throws(() => scaffoldFeature(root, "FAR-2199-fix-2", { level: 0 }), /kebab-case/);
});

test("a new-capability delta stub is a marked placeholder: validate warns, sync refuses", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  scaffoldFeature(root, "add-widget", { level: 2 });
  const dir = path.join(root, "lawbook", "changes", "add-widget");
  assert.ok(isPlaceholderDelta(read(dir, SPEC)));
  const v = specValidate(root, "add-widget");
  assert.equal(v.valid, true);
  assert.ok(v.warnings.some((w) => /placeholder delta/.test(w)));
  assert.throws(() => specSync(root, "add-widget"), /placeholder delta/);
  assert.ok(!has(root, "lawbook/specs/add-widget"), "nothing promoted");

  // Once filled in (marker removed), the warning clears and sync promotes it.
  fs.writeFileSync(
    path.join(dir, SPEC),
    read(dir, SPEC).replace(PLACEHOLDER_DELTA_MARKER + "\n", ""),
  );
  assert.ok(!specValidate(root, "add-widget").warnings.some((w) => /placeholder/.test(w)));
  assert.deepEqual(specSync(root, "add-widget").created, ["lawbook/specs/add-widget/spec.md"]);
});

test("a delta that quotes the marker inline is not a placeholder: no warning, sync promotes", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const dir = path.join(root, "lawbook", "changes", "docs-marker");
  const delta =
    "# Docs\n\n### Requirement: Marker\n" +
    `The stub SHALL carry the \`${PLACEHOLDER_DELTA_MARKER}\` marker; prose ${PLACEHOLDER_DELTA_MARKER} too.\n\n` +
    "#### Scenario: s\n- Given a draft\n- When validated\n- Then it warns\n";
  fs.mkdirSync(path.join(dir, "specs", "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "specs", "docs", "spec.md"), delta);
  assert.equal(isPlaceholderDelta(delta), false);
  assert.equal(isPlaceholderDelta(`x\n${PLACEHOLDER_DELTA_MARKER}  \ny`), true);
  const v = specValidate(root, "docs-marker");
  assert.ok(!v.warnings.some((w) => /placeholder/.test(w)), v.warnings.join("; "));
  assert.deepEqual(specSync(root, "docs-marker").created, ["lawbook/specs/docs/spec.md"]);
});
