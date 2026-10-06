import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { runOwners } from "../../src/cli/commands/owners.js";
import { CANONICAL_TOOLS, MAX_CANONICAL_TOOLS } from "../../src/shared/tool-catalog.js";

// Covers: req~owners-cli~1

class ExitCalled extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

interface Captured {
  out: string[];
  err: string[];
}

/**
 * Run `runOwners` in-process inside `repo`: chdir there, capture console
 * output, and turn `process.exit` into a thrown `ExitCalled` so the exit code
 * is observable without ending the test runner.
 */
async function owners(
  t: TestContext,
  repo: string,
  flags: Record<string, string | boolean>,
): Promise<Captured & { exit: number | undefined | null }> {
  const cap: Captured = { out: [], err: [] };
  const prev = process.cwd();
  process.chdir(repo);
  const log = t.mock.method(console, "log", (...a: unknown[]) => cap.out.push(a.join(" ")));
  const error = t.mock.method(console, "error", (...a: unknown[]) => cap.err.push(a.join(" ")));
  const exit = t.mock.method(process, "exit", (code?: number) => {
    throw new ExitCalled(code);
  });
  let code: number | undefined | null = null;
  try {
    await runOwners(flags as never);
  } catch (e) {
    if (!(e instanceof ExitCalled)) throw e;
    code = e.code;
  } finally {
    log.mock.restore();
    error.mock.restore();
    exit.mock.restore();
    process.chdir(prev);
  }
  return { ...cap, exit: code };
}

const CONFIG = `team:\n  owners:\n    cli: ["@esneiderbravo"]\n    "*": ["@esneiderbravo"]\n`;

test("owners --write compiles team.owners into a CODEOWNERS block, keeping user lines", async (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", CONFIG);
  write(repo, ".github/CODEOWNERS", "# keep me\n");
  const r = await owners(t, repo, { write: true });
  assert.equal(r.exit, null, r.err.join("\n"));
  assert.match(r.out.join("\n"), /wrote speclaw owners block/);
  const text = fs.readFileSync(path.join(repo, ".github", "CODEOWNERS"), "utf8");
  assert.ok(text.includes("# keep me"));
  assert.ok(text.includes("lawbook/specs/cli/"));
  assert.ok(text.trimEnd().endsWith("# <<< speclaw:owners"));
});

test("owners check mode passes on a fresh block and signals drift without writing", async (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", CONFIG);
  assert.equal((await owners(t, repo, { write: true })).exit, null);

  const ok = await owners(t, repo, { check: true });
  assert.equal(ok.exit, null, ok.err.join("\n"));

  const file = path.join(repo, ".github", "CODEOWNERS");
  // Stale block: config gains a capability the written block does not carry.
  write(repo, "lawbook/config.yaml", CONFIG + `    lawbook: ["@org/platform"]\n`);
  const before = fs.readFileSync(file, "utf8");
  const drift = await owners(t, repo, {});
  assert.equal(drift.exit, 1);
  assert.ok(drift.err.length > 0, "drift is reported on stderr");
  assert.match(drift.out.join("\n"), /owners --write/);
  assert.equal(fs.readFileSync(file, "utf8"), before, "check mode never mutates CODEOWNERS");

  const diff = await owners(t, repo, { diff: true });
  assert.equal(diff.exit, 1);
  const shown = diff.out.join("\n");
  assert.match(shown, /expected/);
  assert.match(shown, /actual/);
  assert.ok(shown.includes("@org/platform"), "the diff shows the expected block");
  assert.equal(fs.readFileSync(file, "utf8"), before, "diff mode never mutates CODEOWNERS");
});

test("owners --write without team.owners is a no-op that creates nothing", async (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", "ceremony:\n  cuts: [3]\n");
  const r = await owners(t, repo, { write: true });
  assert.equal(r.exit, null);
  assert.equal(fs.existsSync(path.join(repo, ".github", "CODEOWNERS")), false);
});

test("owners --write exits 1 on an invalid owner token", async (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["not-an-owner"]\n`);
  const r = await owners(t, repo, { write: true });
  assert.equal(r.exit, 1);
  assert.ok(r.err.join("\n").includes("not-an-owner"));
  assert.equal(fs.existsSync(path.join(repo, ".github", "CODEOWNERS")), false);
});

test("owners is CLI-only: the MCP catalog has no owners-mutating tool", () => {
  assert.ok(CANONICAL_TOOLS.length <= MAX_CANONICAL_TOOLS);
  for (const name of CANONICAL_TOOLS as readonly string[]) {
    assert.ok(!/owner/i.test(name), `unexpected owners tool: ${name}`);
  }
});

test("help text and dispatch list owners", () => {
  // The entrypoint runs main() on import, so assert on its source: the usage
  // line and the dispatch case are what `speclaw help` / `speclaw owners` use.
  const src = fs.readFileSync(path.join(process.cwd(), "src", "cli", "index.ts"), "utf8");
  assert.match(src, /^\s+owners\s+Compile team\.owners/m);
  assert.match(src, /case "owners":[\s\S]{0,80}runOwners\(flags\)/);
});
