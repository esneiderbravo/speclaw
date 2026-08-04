import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import {
  specExists,
  specInit,
  specValidate,
  specSync,
  specArchive,
  specArchivePreconditions,
  specList,
} from "../../src/modules/lawbook/engine.js";

const VALID_SPEC = `# Cap

### Requirement: Thing
The system SHALL do the thing.

#### Scenario: happy
- Given a context
- When an action
- Then an outcome
`;

/** Seed a complete, archivable change under lawbook/changes/<name>. */
function seedChange(root: string, name: string, opts: { tasksChecked?: boolean } = {}): void {
  const base = `lawbook/changes/${name}`;
  write(root, `${base}/proposal.md`, "# Proposal\nwhy");
  write(
    root,
    `${base}/tasks.md`,
    opts.tasksChecked === false ? "- [ ] do a thing\n" : "- [x] do a thing\n",
  );
  write(root, `${base}/specs/cap/spec.md`, VALID_SPEC);
  write(root, `${base}/reports/backend.md`, "# backend\nverdict: pass");
}

test("specExists reflects whether lawbook/ is present", (t) => {
  const root = tmpRepo(t);
  assert.equal(specExists(root), false);
  specInit(root);
  assert.equal(specExists(root), true);
});

test("specInit creates the workspace and is idempotent", (t) => {
  const root = tmpRepo(t);
  const first = specInit(root);
  assert.equal(first.alreadyExisted, false);
  assert.ok(first.created.includes("config.yaml"));
  assert.ok(has(root, "lawbook/specs"));
  assert.ok(has(root, "lawbook/changes/archive"));

  const second = specInit(root);
  assert.equal(second.alreadyExisted, true);
  assert.equal(second.created.length, 0);
});

test("specValidate reports a missing change", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const res = specValidate(root, "ghost");
  assert.equal(res.valid, false);
  assert.match(res.issues[0]!, /not found/);
});

test("specValidate passes a well-formed change", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedChange(root, "good");
  const res = specValidate(root, "good");
  assert.deepEqual(res.issues, []);
  assert.equal(res.valid, true);
  assert.equal(res.deltaSpecs.length, 1);
});

test("specValidate flags missing artifacts and non-normative specs", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  // proposal + tasks missing; a delta spec lacking SHALL/Scenario/Requirement
  write(root, "lawbook/changes/bad/specs/cap/spec.md", "# Cap\njust prose\n");
  const res = specValidate(root, "bad");
  assert.ok(res.issues.some((i) => /missing proposal.md/.test(i)));
  assert.ok(res.issues.some((i) => /missing tasks.md/.test(i)));
  assert.ok(res.issues.some((i) => /SHALL\/MUST/.test(i)));
  assert.ok(res.issues.some((i) => /Scenario:/.test(i)));
  assert.ok(res.issues.some((i) => /Requirement:/.test(i)));
});

test("specValidate flags a change with no delta specs", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  write(root, "lawbook/changes/nospec/proposal.md", "x");
  write(root, "lawbook/changes/nospec/tasks.md", "- [ ] x");
  const res = specValidate(root, "nospec");
  assert.ok(res.issues.some((i) => /no delta specs/.test(i)));
});

test("specSync promotes delta specs into the canonical specs/", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedChange(root, "feat");
  const res = specSync(root, "feat");
  assert.deepEqual(res.promoted, ["lawbook/specs/cap/spec.md"]);
  assert.equal(read(root, "lawbook/specs/cap/spec.md"), VALID_SPEC);
});

test("specSync throws on a missing change", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  assert.throws(() => specSync(root, "ghost"), /not found/);
});

test("specSync returns empty when the change has no specs/ dir", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  write(root, "lawbook/changes/empty/proposal.md", "x");
  assert.deepEqual(specSync(root, "empty").promoted, []);
});

test("specArchivePreconditions reports each blocker", (t) => {
  const root = tmpRepo(t);
  specInit(root);

  assert.deepEqual(specArchivePreconditions(root, "ghost"), [
    'change "ghost" not found under lawbook/changes/',
  ]);

  // unchecked task + not synced + report present
  seedChange(root, "wip", { tasksChecked: false });
  const blockers = specArchivePreconditions(root, "wip");
  assert.ok(blockers.some((b) => /unchecked task/.test(b)));
  assert.ok(blockers.some((b) => /not synced.*missing/.test(b)));

  // check tasks + sync -> archivable
  write(root, "lawbook/changes/wip/tasks.md", "- [x] done\n");
  specSync(root, "wip");
  assert.deepEqual(specArchivePreconditions(root, "wip"), []);
});

test("specArchivePreconditions blocks when a report is missing and when specs differ", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  seedChange(root, "c");
  specSync(root, "c");
  // remove the discipline report (README-only does not count)
  fs.rmSync(path.join(root, "lawbook/changes/c/reports/backend.md"));
  write(root, "lawbook/changes/c/reports/README.md", "scaffold");
  assert.ok(specArchivePreconditions(root, "c").some((b) => /no discipline report/.test(b)));

  // restore report, then diverge the delta from canonical
  write(root, "lawbook/changes/c/reports/backend.md", "x");
  write(root, "lawbook/changes/c/specs/cap/spec.md", VALID_SPEC + "\nextra\n");
  assert.ok(specArchivePreconditions(root, "c").some((b) => /differs from the delta/.test(b)));
});

test("specArchive refuses a blocked change and archives a clean one", (t) => {
  const root = tmpRepo(t);
  specInit(root);

  seedChange(root, "blocked", { tasksChecked: false });
  assert.throws(() => specArchive(root, "blocked", "2026-08-04"), /cannot archive/);

  seedChange(root, "ready");
  specSync(root, "ready");
  const res = specArchive(root, "ready", "2026-08-04");
  assert.equal(res.archivedTo, "lawbook/changes/archive/2026-08-04-ready");
  assert.ok(has(root, "lawbook/changes/archive/2026-08-04-ready/proposal.md"));
  assert.ok(!has(root, "lawbook/changes/ready"));
});

test("specArchive throws on a missing change", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  assert.throws(() => specArchive(root, "ghost", "2026-08-04"), /not found/);
});

test("specList reports initialization, active/archived changes, and capabilities", (t) => {
  const root = tmpRepo(t);
  assert.equal(specList(root).initialized, false);

  specInit(root);
  seedChange(root, "active");
  write(root, "lawbook/specs/existing/spec.md", VALID_SPEC);
  const list = specList(root);
  assert.equal(list.initialized, true);
  assert.deepEqual(list.activeChanges, ["active"]);
  assert.deepEqual(list.capabilities, ["existing"]);
  assert.deepEqual(list.archivedChanges, []);
});
