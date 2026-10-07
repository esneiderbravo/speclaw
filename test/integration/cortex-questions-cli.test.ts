import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write, read } from "../helpers/env.js";
import { runCli, cliBuilt } from "../helpers/cli.js";

const skip = cliBuilt() ? false : "dist/ not built — run `npm run build` first";

/** A lawbook project whose `demo` change has a harness parked in `planning`. */
function seedPlanning(root: string): void {
  write(root, "lawbook/config.yaml", "schema: lawbook\ncompassGate: off\n");
  write(root, "lawbook/changes/demo/proposal.md", "# p\n");
  write(root, "lawbook/changes/demo/tasks.md", "- [ ] one\n");
  write(root, "lawbook/changes/demo/change.json", JSON.stringify({ confirmedLevel: 2 }));
  assert.equal(runCli(["cortex", "start", "--change", "demo"], { cwd: root }).code, 0);
  const toPlanning = runCli(["cortex", "advance", "--change", "demo"], { cwd: root });
  assert.equal(toPlanning.code, 0, toPlanning.stderr);
  assert.equal(harness(root).stage, "planning");
}

function harness(root: string): { stage: string; openQuestions: string[] } {
  return JSON.parse(read(root, "lawbook/changes/demo/harness.json")) as {
    stage: string;
    openQuestions: string[];
  };
}

// Covers: req~harness-state~1
test("cortex advance records each repeated --question as one open question", { skip }, (t) => {
  const flags = ["--pause-questions", "--question", "a", "--question", "b, c"];
  for (const cmd of [
    ["cortex", "advance", "--change", "demo"],
    ["lawbook", "harness", "advance", "--change", "demo"],
  ]) {
    const root = tmpRepo(t);
    seedPlanning(root);
    const r = runCli([...cmd, ...flags], { cwd: root });
    assert.equal(r.code, 0, `${cmd.join(" ")}: ${r.stderr}`);
    const state = harness(root);
    assert.equal(state.stage, "questions", cmd.join(" "));
    assert.deepEqual(state.openQuestions, ["a", "b, c"], cmd.join(" "));
  }
});

// Covers: req~harness-pause-questions~1
test("advance --pause-questions from implementing exits non-zero", { skip }, (t) => {
  const root = tmpRepo(t);
  seedPlanning(root);
  const toImpl = runCli(["cortex", "advance", "--change", "demo"], { cwd: root });
  assert.equal(toImpl.code, 0, toImpl.stderr);
  assert.equal(harness(root).stage, "implementing");
  const before = read(root, "lawbook/changes/demo/harness.json");
  for (const cmd of [
    ["cortex", "advance", "--change", "demo"],
    ["lawbook", "harness", "advance", "--change", "demo"],
  ]) {
    const r = runCli([...cmd, "--pause-questions", "--question", "q1"], { cwd: root });
    assert.notEqual(r.code, 0, `${cmd.join(" ")}: ${r.stdout}`);
    assert.match(r.stderr + r.stdout, /planning/);
    assert.equal(read(root, "lawbook/changes/demo/harness.json"), before, cmd.join(" "));
  }
});
