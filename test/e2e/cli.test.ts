import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { seedSampleRepo, sampleProfile, speclawLayout } from "../helpers/fixtures.js";
import { runCli, cliBuilt } from "../helpers/cli.js";
import { COMMANDS } from "../../src/cli/lib/help.js";
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

test("lawbook draft <name> --level 2 --json scaffolds a feature change", { skip }, (t) => {
  // Covers: req~feature-draft~1
  const root = tmpRepo(t);
  assert.equal(runCli(["lawbook", "init"], { cwd: root }).code, 0);
  const r = runCli(["lawbook", "draft", "add-widget", "--level", "2", "--json"], {
    cwd: root,
    ...FORCED,
  });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes(TAGLINE), "no branded header on --json");
  const out = JSON.parse(r.stdout) as { change: string; level: number; changeType: string };
  assert.deepEqual([out.change, out.level, out.changeType], ["add-widget", 2, "feature"]);
  const base = "lawbook/changes/add-widget";
  for (const f of ["proposal.md", "design.md", "tasks.md", "reports/README.md"]) {
    assert.ok(has(root, `${base}/${f}`), f);
  }
  assert.ok(has(root, `${base}/specs/add-widget/spec.md`));
  assert.ok(!has(root, `${base}/bugfix.md`));
  const valid = runCli(["lawbook", "validate", "add-widget"], { cwd: root });
  assert.equal(valid.code, 0, valid.stderr);
  assert.match(valid.stdout + valid.stderr, /add-widget is valid/);
  const rec = JSON.parse(read(root, `${base}/change.json`)) as Record<string, unknown>;
  assert.equal(rec.confirmedLevel, 2);
  assert.equal(rec.changeType, "feature");

  const again = runCli(["lawbook", "draft", "add-widget"], { cwd: root });
  assert.notEqual(again.code, 0);
  assert.match(again.stdout + again.stderr, /add-widget.*already exists/);

  const help = runCli(["help"], { cwd: root });
  assert.match(help.stdout, /draft <name>/);
  assert.match(help.stdout, /--level/);
});

test("index prints repository totals and the next step, also as --json", { skip }, (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  const first = runCli(["index"], { cwd: root });
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /Totals: \d+ files · \d+ nodes · \d+ edges/);
  assert.match(first.stdout, /compass_find/);
  assert.match(first.stdout, /compass_explore/);
  const again = runCli(["index", "--json"], { cwd: root, ...FORCED });
  assert.equal(again.code, 0, again.stderr);
  assert.ok(!again.stdout.includes(TAGLINE), "no branded header on --json");
  const stats = JSON.parse(again.stdout) as {
    files: number;
    totals: { files: number; nodes: number };
    nextStep: string;
  };
  assert.equal(stats.files, 0, "no-op rerun re-extracts nothing");
  assert.ok(stats.totals.files > 0 && stats.totals.nodes > 0);
  assert.match(stats.nextStep, /compass_find/);
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
  speclawLayout(root);
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

// Per-command --help / -h. Each row runs in an empty temp dir with a temp HOME
// (holding a cached newer `latest`, so an enabled notifier would have something
// to print) and the notifier left enabled. The directory must be byte-identical
// afterwards, stdout must carry `Usage`, and nothing may be started: the timeout
// bounds `mcp`/`watch`, which would otherwise keep running.
const HELP_COMMANDS: readonly string[] = COMMANDS.map((c) => c.name);

/** Recursive listing of `root` with a content hash per file (dirs marked). */
function snapshotDir(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      if (e.isDirectory()) {
        out.push(`${rel}/`);
        walk(abs);
      } else {
        out.push(`${rel} ${createHash("sha256").update(readFileSync(abs)).digest("hex")}`);
      }
    }
  };
  walk(root);
  return out.sort();
}

for (const cmd of HELP_COMMANDS) {
  for (const flag of ["--help", "-h"]) {
    // Covers: req~per-command-help~1
    test(`\`${cmd} ${flag}\` prints usage without side effects`, { skip }, (t) => {
      const root = tmpRepo(t, "speclaw-help-");
      const home = tmpRepo(t, "speclaw-help-home-");
      mkdirSync(path.join(home, ".speclaw"), { recursive: true });
      writeFileSync(
        path.join(home, ".speclaw", "update-check.json"),
        JSON.stringify({ checkedAt: Date.now(), latest: "999.0.0" }),
      );
      const before = snapshotDir(root);
      const r = runCli([cmd, flag], {
        cwd: root,
        timeout: 15_000,
        env: {
          HOME: home,
          USERPROFILE: home,
          NO_COLOR: undefined,
          FORCE_COLOR: "1",
          NO_UPDATE_NOTIFIER: undefined,
          SPECLAW_NO_UPDATE_NOTIFIER: undefined,
          // Lift the notifier's TTY check so a reached notifier would print.
          SPECLAW_UPDATE_NOTIFIER: "force",
        },
      });
      assert.equal(r.code, 0, `exit code (stderr: ${r.stderr.slice(0, 300)})`);
      assert.match(r.stdout, /Usage/);
      assert.deepEqual(snapshotDir(root), before, "the directory is byte-identical");
      assert.doesNotMatch(r.stdout, new RegExp(TAGLINE), "no branded header");
      assert.doesNotMatch(r.stderr, /available/, "no update notice");
      if (cmd === "update") assert.match(r.stdout, /--no-self-update/);
      if (cmd === "laws") assert.match(r.stdout, /lock[^\n]*--force/);
    });
  }
}

// Control for the "no update notice" assertion above: with the same cached
// newer version and forced notifier, a command that is not help prints it.
// Covers: req~per-command-help~1
test("the forced notifier prints for a non-help command (help-table control)", { skip }, (t) => {
  const root = tmpRepo(t, "speclaw-help-control-");
  const home = tmpRepo(t, "speclaw-help-control-home-");
  mkdirSync(path.join(home, ".speclaw"), { recursive: true });
  writeFileSync(
    path.join(home, ".speclaw", "update-check.json"),
    JSON.stringify({ checkedAt: Date.now(), latest: "999.0.0" }),
  );
  const r = runCli(["laws", "scan", "--json"], {
    cwd: root,
    timeout: 15_000,
    env: {
      HOME: home,
      USERPROFILE: home,
      NO_UPDATE_NOTIFIER: undefined,
      SPECLAW_NO_UPDATE_NOTIFIER: undefined,
      SPECLAW_UPDATE_NOTIFIER: "force",
    },
  });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /999\.0\.0[\s\S]*available/);
});
