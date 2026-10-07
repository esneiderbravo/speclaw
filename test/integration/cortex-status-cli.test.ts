import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { runCli, cliBuilt } from "../helpers/cli.js";

const skip = cliBuilt() ? false : "dist/ not built — run `npm run build` first";

function seed(root: string): void {
  write(root, "lawbook/config.yaml", "schema: lawbook\ncortex:\n  statusIntervalMinutes: 10\n");
  write(root, "lawbook/changes/demo/proposal.md", "# p\n");
  write(root, "lawbook/changes/demo/tasks.md", "- [x] one\n- [ ] two\n");
  write(root, "lawbook/changes/demo/change.json", JSON.stringify({ confirmedLevel: 2 }));
}

// Covers: req~cortex-status-summary~1
test("cortex status prints the summary line on stderr and JSON on stdout", { skip }, (t) => {
  const root = tmpRepo(t);
  seed(root);
  assert.equal(runCli(["cortex", "start", "--change", "demo"], { cwd: root }).code, 0);

  const r = runCli(["cortex", "status", "--change", "demo"], { cwd: root });
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout) as {
    state: { stage: string };
    summary: { line: string; tasks: unknown; statusIntervalMinutes: number; role: string };
  };
  assert.equal(out.state.stage, "exploring");
  assert.equal(out.summary.role, "explorer");
  assert.deepEqual(out.summary.tasks, { done: 1, total: 2 });
  assert.equal(out.summary.statusIntervalMinutes, 10);
  assert.match(out.summary.line, /^demo · exploring \(explorer\) · 0m in stage · tasks 1\/2/);
  assert.ok(r.stderr.includes(out.summary.line), `stderr lacks the line: ${r.stderr}`);

  const quiet = runCli(["cortex", "status", "--change", "demo", "--json"], { cwd: root });
  assert.equal(quiet.code, 0, quiet.stderr);
  const quietOut = JSON.parse(quiet.stdout) as { summary: { line: string } };
  assert.ok(!quiet.stderr.includes(quietOut.summary.line), "--json must not print the line");
});

test("cortex status without a harness returns a null summary and no line", { skip }, (t) => {
  const root = tmpRepo(t);
  seed(root);
  const r = runCli(["cortex", "status", "--change", "demo"], { cwd: root });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { state: null, summary: null });
  assert.equal(r.stderr.trim(), "");

  const missing = runCli(["cortex", "status", "--change", "nope"], { cwd: root });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /not found/);
});
