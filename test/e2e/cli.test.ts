import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpRepo } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { runCli, cliBuilt } from "../helpers/cli.js";

// The e2e suite drives the built dist/ CLI. It requires `npm run build` to have
// run first (CI does this before `npm test`); otherwise it skips with a notice.
const skip = cliBuilt() ? false : "dist/ not built — run `npm run build` before the e2e suite";

// The version the CLI must report is the one in the package's package.json —
// four levels up from this compiled file (dist-test/test/e2e/cli.test.js).
const PKG_VERSION = (
  JSON.parse(
    readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;

test("help prints usage and exits zero", { skip }, () => {
  const r = runCli(["help"]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Usage: speclaw/);
});

for (const alias of ["--version", "-v", "version"]) {
  test(`\`${alias}\` prints the package version and exits zero`, { skip }, () => {
    const r = runCli([alias]);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), PKG_VERSION);
    // Bare version only — never the Unknown-command path or the HELP dump.
    assert.doesNotMatch(r.stdout + r.stderr, /Unknown command|Usage: speclaw/);
  });
}

test("help lists the --version command", { skip }, () => {
  const r = runCli(["help"]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--version/);
});

// The one-line branded header. `FORCE_COLOR=1` (with NO_COLOR dropped) makes the
// child treat itself as interactive so the header renders even though its stdout
// is a pipe; the tagline is unique to the header, so its presence/absence and
// count are a reliable probe. The default `runCli` (non-TTY, NO_COLOR) stands in
// for a piped invocation.
const TAGLINE = "where specs become law";
const FORCED: { env: Record<string, string | undefined> } = {
  env: { NO_COLOR: undefined, FORCE_COLOR: "1" },
};

test("help shows the branded header once, ahead of the usage text", { skip }, () => {
  const r = runCli(["help"], FORCED);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.includes(TAGLINE), "header tagline present");
  assert.ok(
    r.stdout.indexOf(TAGLINE) < r.stdout.indexOf("Usage: speclaw"),
    "header precedes the usage text",
  );
  assert.equal((r.stdout.match(/where specs become law/g) ?? []).length, 1, "exactly one header");
});

test("piped (non-TTY) output omits the header", { skip }, () => {
  const r = runCli(["help"]);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.stdout, /where specs become law/);
});

test("--version emits no header even when forced interactive", { skip }, () => {
  const r = runCli(["--version"], FORCED);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), PKG_VERSION);
  assert.doesNotMatch(r.stdout, /where specs become law/);
});

test("a query command emits no header even when forced interactive", { skip }, (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  runCli(["index"], { cwd: root });

  const r = runCli(["search", "beta"], { cwd: root, ...FORCED });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.stdout, /where specs become law/);
});

test("an unknown command exits non-zero", { skip }, () => {
  const r = runCli(["frobnicate"]);
  assert.equal(r.code, 1);
  assert.match(r.stdout + r.stderr, /Unknown command/);
});

test("doctor on an unconfigured project exits non-zero and reports checks", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["doctor"], { cwd: root });
  assert.equal(r.code, 1);
  assert.match(r.stdout + r.stderr, /ai-specs/);
});

test("lawbook init then list runs the workflow from the shell", { skip }, (t) => {
  const root = tmpRepo(t);
  const init = runCli(["lawbook", "init"], { cwd: root });
  assert.equal(init.code, 0);
  assert.match(init.stdout + init.stderr, /lawbook\//);

  const list = runCli(["lawbook", "list"], { cwd: root });
  assert.equal(list.code, 0);
  assert.match(list.stdout + list.stderr, /capabilities/);
});

test("index then explore/search a real node from the shell", { skip }, (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);

  const index = runCli(["index"], { cwd: root });
  assert.equal(index.code, 0, index.stderr);
  assert.match(index.stdout + index.stderr, /files/);

  const explore = runCli(["explore", "alpha"], { cwd: root });
  assert.equal(explore.code, 0);
  assert.match(explore.stdout, /function alpha/);

  const search = runCli(["search", "beta"], { cwd: root });
  assert.equal(search.code, 0);
  assert.match(search.stdout + search.stderr, /beta/);
});

test("a query without an index exits non-zero with a helpful message", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["explore", "whatever"], { cwd: root });
  assert.equal(r.code, 1);
  assert.match(r.stdout + r.stderr, /No index/);
});
