import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { CANONICAL_TOOLS, MAX_CANONICAL_TOOLS } from "../../src/shared/tool-catalog.js";

// Covers: req~owners-cli~1
const cli = path.join(process.cwd(), "dist/cli/index.js");

function run(
  cwd: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

test("help lists owners and MCP catalog stays at eight tools", () => {
  const help = run(process.cwd(), ["help"]);
  assert.equal(help.status, 0, help.stderr + help.stdout);
  assert.ok(help.stdout.includes("owners"));
  assert.equal(CANONICAL_TOOLS.length, MAX_CANONICAL_TOOLS);
  assert.ok(!(CANONICAL_TOOLS as readonly string[]).includes("owners"));
  assert.ok(!(CANONICAL_TOOLS as readonly string[]).includes("team_owners"));
});

test("speclaw owners --write and check round-trip", (t) => {
  const repo = tmpRepo(t);
  write(
    repo,
    "lawbook/config.yaml",
    `team:\n  owners:\n    cli: ["@esneiderbravo"]\n    "*": ["@esneiderbravo"]\n`,
  );
  write(repo, ".github/CODEOWNERS", "# keep me\n");
  const w = run(repo, ["owners", "--write"]);
  assert.equal(w.status, 0, w.stderr + w.stdout);
  const text = fs.readFileSync(path.join(repo, ".github", "CODEOWNERS"), "utf8");
  assert.ok(text.includes("# keep me"));
  assert.ok(text.includes("lawbook/specs/cli/"));
  assert.ok(text.trimEnd().endsWith("# <<< speclaw:owners"));

  const ok = run(repo, ["owners", "--check"]);
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);

  fs.appendFileSync(path.join(repo, ".github", "CODEOWNERS"), "\n* @later\n");
  const drift = run(repo, ["owners", "--check"]);
  assert.notEqual(drift.status, 0);
});

test("owners --write with no team.owners exits 0 without creating CODEOWNERS", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", "ceremony:\n  cuts: [3]\n");
  const w = run(repo, ["owners", "--write"]);
  assert.equal(w.status, 0, w.stderr + w.stdout);
  assert.equal(fs.existsSync(path.join(repo, ".github", "CODEOWNERS")), false);
});

test("owners --write rejects bad tokens via CLI", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["not-an-owner"]\n`);
  const w = run(repo, ["owners", "--write"]);
  assert.notEqual(w.status, 0);
  assert.ok((w.stderr + w.stdout).includes("not-an-owner"));
});
