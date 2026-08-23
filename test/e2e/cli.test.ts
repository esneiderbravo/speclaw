import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { seedSampleRepo, sampleProfile } from "../helpers/fixtures.js";
import { runCli, cliBuilt } from "../helpers/cli.js";
import { scaffold } from "../../src/modules/foundation/scaffold.js";
import { gitInit, commit } from "../helpers/git.js";
import { spawnSync } from "node:child_process";

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

test("doctor --json on an unconfigured project exits zero with schemaVersion", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["doctor", "--json", "--offline"], { cwd: root });
  assert.equal(r.code, 0);
  const report = JSON.parse(r.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.sections.length, 5);
});

test("doctor --strict exits non-zero when warnings exist", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["doctor", "--offline", "--strict"], { cwd: root });
  // Uninitialised projects have configuration skips and often env.git warn.
  assert.ok(r.code === 0 || r.code === 1);
  const json = runCli(["doctor", "--json", "--offline"], { cwd: root });
  const report = JSON.parse(json.stdout);
  if (report.status === "warn" || report.status === "error") {
    assert.equal(r.code, 1);
  }
});

test("check --hook-payload denies a .env edit with exit code 2", { skip }, (t) => {
  const root = tmpRepo(t);
  scaffold(root, sampleProfile(), [], ["claude"]); // seeds the manifest (has a .env bloqueo law)

  const deny = runCli(["check", "--hook-payload", "-"], {
    cwd: root,
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: ".env" },
    }),
  });
  assert.equal(deny.code, 2);
  assert.match(deny.stdout, /"permissionDecision":\s*"deny"/);

  const allow = runCli(["check", "--hook-payload", "-"], {
    cwd: root,
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: "README.md" },
    }),
  });
  assert.equal(allow.code, 0);
  assert.match(allow.stdout, /"permissionDecision":\s*"allow"/);
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

test("help lists the verify command", { skip }, () => {
  const r = runCli(["help"]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /\bverify\b/);
});

test("verify emits no header even when forced interactive", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["verify"], { cwd: root, ...FORCED });
  assert.doesNotMatch(r.stdout, /where specs become law/);
});

test("verify --fail-on with an unknown value exits 2", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["verify", "--fail-on", "fatal"], { cwd: root });
  assert.equal(r.code, 2);
});

test("verify --format with an unknown value exits 2", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["verify", "--format", "xml"], { cwd: root });
  assert.equal(r.code, 2);
});

test("verify without an index exits 0; --strict-engines exits 4", { skip }, (t) => {
  const root = tmpRepo(t);
  const soft = runCli(["verify"], { cwd: root });
  assert.equal(soft.code, 0);
  const strict = runCli(["verify", "--strict-engines"], { cwd: root });
  assert.equal(strict.code, 4);
  assert.match(strict.stdout + strict.stderr, /no-index/);
});

test("verify --json and --sarif write well-formed artifacts", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["verify", "--json", "out.json", "--sarif", "out.sarif"], { cwd: root });
  assert.equal(r.code, 0);
  assert.ok(has(root, "out.json"));
  assert.ok(has(root, "out.sarif"));
  const json = JSON.parse(read(root, "out.json")) as { schemaVersion: number };
  assert.equal(json.schemaVersion, 1);
  const sarif = JSON.parse(read(root, "out.sarif")) as { version: string };
  assert.equal(sarif.version, "2.1.0");
});

test("verify --json (boolean) prints the report on stdout", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["verify", "--json"], { cwd: root });
  assert.equal(r.code, 0);
  const parsed = JSON.parse(r.stdout) as { schemaVersion: number };
  assert.equal(parsed.schemaVersion, 1);
});

test("verify --ci on a shallow clone exits 3", { skip }, (t) => {
  const origin = tmpRepo(t);
  gitInit(origin);
  commit(origin, "one", [{ path: "a.ts", content: "a\n" }]);
  const parent = tmpRepo(t);
  const dest = path.join(parent, "shallow");
  spawnSync("git", ["clone", "--depth=1", "-q", `file://${origin}`, dest], { encoding: "utf8" });
  const r = runCli(["verify", "--ci"], { cwd: dest });
  assert.equal(r.code, 3);
  assert.match(r.stdout + r.stderr, /fetch-depth: 0/);
});

test("verify cannot write SARIF to a missing directory and exits 3", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["verify", "--sarif", path.join("nope", "out.sarif")], { cwd: root });
  assert.equal(r.code, 3);
});

test("verify appends markdown to $GITHUB_STEP_SUMMARY when set", { skip }, (t) => {
  const root = tmpRepo(t);
  const summary = path.join(root, "summary.md");
  write(root, "summary.md", "");
  const r = runCli(["verify"], { cwd: root, env: { GITHUB_STEP_SUMMARY: summary } });
  assert.equal(r.code, 0);
  assert.match(read(root, "summary.md"), /speclaw/);
});

test("verify --ci exits 1 when a seed graph law finds a cycle", { skip }, (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/a.ts",
    'import { b } from "./b.js";\nexport function a(): number {\n  return b();\n}\n',
  );
  write(
    root,
    "src/b.ts",
    'import { a } from "./a.js";\nexport function b(): number {\n  return a();\n}\n',
  );
  const indexed = runCli(["index"], { cwd: root });
  assert.equal(indexed.code, 0, indexed.stderr);
  const r = runCli(["verify", "--ci"], { cwd: root });
  assert.equal(r.code, 1);
  assert.match(r.stdout + r.stderr, /law~no-module-cycles~1/);
});
