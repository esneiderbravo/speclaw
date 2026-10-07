import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { runCli, cliBuilt } from "../helpers/cli.js";

test("default init creates only .agents/, linked into ai-specs/", { skip: !cliBuilt() }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["init", "--yes"], { cwd: root, timeout: 120_000 });
  assert.equal(r.code, 0, r.stderr);

  for (const dir of [".claude", ".cursor", ".codex", ".windsurf", ".github/instructions"]) {
    assert.ok(!fs.existsSync(path.join(root, dir)), `${dir} must not be created`);
  }
  for (const target of ["skills", "commands", "agents", "rules"]) {
    const link = path.join(root, ".agents", target);
    assert.ok(fs.lstatSync(link).isSymbolicLink(), `.agents/${target} is a symlink`);
    assert.equal(fs.readlinkSync(link), path.join("..", "ai-specs", target));
    assert.ok(fs.existsSync(link), `.agents/${target} resolves`);
  }
});

test("init --agents claude still wires Claude Code explicitly", { skip: !cliBuilt() }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["init", "--agents", "claude"], { cwd: root, timeout: 120_000 });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(fs.lstatSync(path.join(root, ".claude", "skills")).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(root, ".agents")));
});
