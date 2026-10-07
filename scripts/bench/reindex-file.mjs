#!/usr/bin/env node
/**
 * Reindex-on-edit benchmark: `main` vs the reindex-on-edit branch.
 *
 * Builds each ref in a throwaway copy under os.tmpdir(), indexes a copy of the
 * branch source tree with each build, then times:
 *
 *   A index-noop          `speclaw index` on the indexed, unchanged copy (main vs branch)
 *   B index-one-edit      `speclaw index` after one function body changed — today's
 *                         way to refresh one file (main vs branch)
 *   C hook-wall           the compiled PostToolUse reindex hook command via `sh -c`
 *                         with an `Edit` payload on stdin, timed to the parent's exit
 *                         (branch only; the detached child's work is not included)
 *   D reindex-file-edit   `speclaw reindex-file <file>` in the foreground after the
 *                         same edit — the detached child's work (branch only)
 *
 * Between C runs (untimed) the bench waits until the previous detached child
 * stored the edited file's hash, so children never overlap a timed run and a
 * child that never lands fails the bench.
 *
 * Every write lands in the bench temp dir: the repo is only read (`git archive`
 * / `git ls-files`), speclaw runs get a sandboxed HOME, and the hook command
 * runs with CLAUDE_PROJECT_DIR pinned to the fixture. The fixture's
 * `node_modules/.bin/speclaw` is a shim to the branch build, so the hook never
 * resolves a global speclaw or npx. Temp dirs are removed on exit unless
 * `--keep`. The only write outside the temp dir is the `--json <file>` the
 * caller names, and, with `--link-node-modules`, whatever the build tooling
 * writes into the shared node_modules.
 *
 * Usage:
 *   node scripts/bench/reindex-file.mjs [--main main] [--branch WORKTREE|<ref>]
 *     [--iterations 30] [--json [file]] [--keep] [--link-node-modules]
 *
 * Budgets (design §5): C median < A median (branch); D median (branch) < B
 * median (main); branch A median ≤ main A median. Plain Node ESM with node:
 * modules only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WARMUP = 3;
const MIN_ITERATIONS = 20;
// Never copied into a build or fixture: credentials, machine-local state, the
// repo's own index.
const NEVER_COPY = [
  /^\.mcp\.json$/,
  /^\.env/,
  /settings\.local\.json$/,
  /^\.idea\//,
  /^\.speclaw\//,
];
// Untracked files are copied only from these roots (the branch's new code).
const UNTRACKED_ROOTS = ["src/", "test/", "scripts/", "lawbook/", "docs/"];
// The file whose one function body changes before each edit run.
const CHANGED_FILE = path.join("src", "shared", "version.ts");
// How long the detached hook child may take before the bench calls it broken.
const CHILD_DEADLINE_MS = 15_000;

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = {
    main: "main",
    branch: "WORKTREE",
    iterations: 30,
    json: null,
    keep: false,
    linkNodeModules: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      i++;
      return v;
    };
    if (a === "--main") out.main = next();
    else if (a === "--branch") out.branch = next();
    else if (a === "--iterations") out.iterations = Number(next());
    else if (a === "--json") {
      const v = argv[i + 1];
      out.json = v && !v.startsWith("--") ? (i++, v) : "-";
    } else if (a === "--keep") out.keep = true;
    else if (a === "--link-node-modules") out.linkNodeModules = true;
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  if (!Number.isInteger(out.iterations) || out.iterations < MIN_ITERATIONS) {
    throw new Error(`--iterations must be an integer ≥ ${MIN_ITERATIONS}`);
  }
  return out;
}

// ---------------------------------------------------------------- helpers

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  if (opts.check !== false && r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}): ${r.stderr || r.stdout}`);
  }
  return r;
}

function git(args, opts = {}) {
  return sh("git", ["-C", REPO, ...args], opts).stdout.trim();
}

function assertInside(root, p) {
  const rel = path.relative(root, p);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`refusing to write outside the bench temp dir: ${p}`);
  }
}

function stats(samplesMs) {
  const s = [...samplesMs].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
  return { n: s.length, median: at(0.5), p95: at(0.95), min: s[0], max: s[s.length - 1] };
}

function time(fn) {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/** Run `run` WARMUP times untimed, then `iterations` times timed; `before` is untimed. */
function sample(iterations, run, before = () => {}) {
  for (let i = 0; i < WARMUP; i++) {
    before(i);
    run(i);
  }
  const out = [];
  for (let i = 0; i < iterations; i++) {
    before(WARMUP + i);
    out.push(time(() => run(WARMUP + i)));
  }
  return stats(out);
}

function log(msg) {
  process.stderr.write(`bench: ${msg}\n`);
}

// ---------------------------------------------------------------- source trees

/** Extract a ref (or the working tree) into `dest` without touching the repo. */
function materialize(ref, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (ref !== "WORKTREE") {
    const tar = path.join(path.dirname(dest), `${path.basename(dest)}.tar`);
    git(["archive", "--format=tar", "-o", tar, ref]);
    sh("tar", ["-xf", tar, "-C", dest]);
    fs.rmSync(tar);
    return;
  }
  const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const untracked = git(["ls-files", "-z", "--others", "--exclude-standard"])
    .split("\0")
    .filter((f) => f && UNTRACKED_ROOTS.some((r) => f.startsWith(r)));
  for (const rel of [...tracked, ...untracked]) {
    if (NEVER_COPY.some((re) => re.test(rel))) continue;
    const src = path.join(REPO, rel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue; // deleted in worktree
    const out = path.join(dest, rel);
    assertInside(dest, out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(src, out);
  }
}

function describeRef(ref) {
  if (ref === "WORKTREE") {
    const dirty = git(["status", "--porcelain"]).length > 0;
    return {
      ref: `working tree (${git(["branch", "--show-current"]) || "detached"})`,
      sha: git(["rev-parse", "HEAD"]) + (dirty ? "+dirty" : ""),
    };
  }
  return { ref, sha: git(["rev-parse", ref]) };
}

function buildRef(label, ref, root, opts) {
  const dir = path.join(root, label, "src");
  log(`[${label}] materializing ${ref}`);
  materialize(ref, dir);
  if (opts.linkNodeModules) {
    fs.symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "node_modules"), "dir");
  } else {
    log(`[${label}] npm ci`);
    sh("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: dir });
  }
  log(`[${label}] npm run build`);
  sh("npm", ["run", "build", "--silent"], { cwd: dir });
  return { label, dir, cli: path.join(dir, "dist", "cli", "index.js"), ...describeRef(ref) };
}

/**
 * Copy the branch source (no node_modules/dist) into a per-build fixture and
 * give it a first index with that build. With `shimCli`, the fixture gets a
 * `node_modules/.bin/speclaw` shim to the build so the hook resolves it first.
 */
function makeFixture(build, sourceDir, root, env, shimCli) {
  const dir = path.join(root, build.label, "fixture");
  assertInside(root, dir);
  fs.cpSync(sourceDir, dir, {
    recursive: true,
    filter: (p) => !/[/\\](node_modules|dist|dist-test|\.speclaw)([/\\]|$)/.test(p),
  });
  if (shimCli) {
    const shim = path.join(dir, "node_modules", ".bin", "speclaw");
    assertInside(root, shim);
    fs.mkdirSync(path.dirname(shim), { recursive: true });
    fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${build.cli}" "$@"\n`);
    fs.chmodSync(shim, 0o755);
  }
  log(`[${build.label}] first index of the fixture`);
  sh("node", [build.cli, "index"], { cwd: dir, env });
  return dir;
}

// ---------------------------------------------------------------- cases

function indexNoop(build, fixture, env, iterations) {
  return sample(iterations, () => sh("node", [build.cli, "index"], { cwd: fixture, env }));
}

/** Rewrite the one function body of CHANGED_FILE so each run sees new content. */
function editor(fixture) {
  const file = path.join(fixture, CHANGED_FILE);
  assertInside(fixture, file);
  const original = fs.readFileSync(file, "utf8");
  if (!/\{\n/.test(original)) throw new Error(`${CHANGED_FILE} has no function body to edit`);
  let last = original;
  return {
    file,
    rel: CHANGED_FILE.split(path.sep).join("/"),
    edit(i) {
      // one statement inserted at the top of the first function body
      last = original.replace(/\{\n/, `{\n  void ${i + 1}; // bench edit\n`);
      fs.writeFileSync(file, last);
      return last;
    },
    get content() {
      return last;
    },
    restore() {
      fs.writeFileSync(file, original);
    },
  };
}

function storedHash(fixture, rel) {
  const db = new DatabaseSync(path.join(fixture, ".speclaw", "index.db"), { readOnly: true });
  try {
    return db.prepare("SELECT hash FROM files WHERE path = ?").get(rel)?.hash ?? null;
  } finally {
    db.close();
  }
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Block (untimed) until the index stores `content`'s hash for `rel`. */
function waitStored(fixture, rel, content) {
  const want = sha(content);
  const deadline = Date.now() + CHILD_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (storedHash(fixture, rel) === want) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  throw new Error(`detached reindex child did not store ${rel} within ${CHILD_DEADLINE_MS} ms`);
}

function indexOneEdit(build, fixture, env, iterations) {
  const ed = editor(fixture);
  try {
    return sample(
      iterations,
      () => sh("node", [build.cli, "index"], { cwd: fixture, env }),
      (i) => ed.edit(i),
    );
  } finally {
    ed.restore();
    sh("node", [build.cli, "index"], { cwd: fixture, env });
  }
}

function hookWall(command, fixture, env, iterations) {
  const ed = editor(fixture);
  const payload = (abs) =>
    JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: abs, old_string: "{", new_string: "{" },
      cwd: fixture,
    });
  let pending = false;
  try {
    const result = sample(
      iterations,
      () => {
        const r = sh("sh", ["-c", command], {
          cwd: fixture,
          input: payload(ed.file),
          env: { ...env, CLAUDE_PROJECT_DIR: fixture },
        });
        if (r.stdout !== "" || r.stderr !== "") {
          throw new Error(`hook command printed output: ${JSON.stringify(r.stdout + r.stderr)}`);
        }
        pending = true;
      },
      (i) => {
        if (pending) waitStored(fixture, ed.rel, ed.content);
        pending = false;
        ed.edit(i);
      },
    );
    waitStored(fixture, ed.rel, ed.content);
    return result;
  } finally {
    ed.restore();
  }
}

function reindexFileEdit(build, fixture, env, iterations) {
  const ed = editor(fixture);
  try {
    const result = sample(
      iterations,
      () => {
        const r = sh("node", [build.cli, "reindex-file", "--", ed.rel], { cwd: fixture, env });
        if (r.stdout !== "" || r.stderr !== "") throw new Error("reindex-file printed output");
      },
      (i) => ed.edit(i),
    );
    if (storedHash(fixture, ed.rel) !== sha(ed.content)) {
      throw new Error("reindex-file did not store the edited file");
    }
    return result;
  } finally {
    ed.restore();
  }
}

// ---------------------------------------------------------------- report

const fmt = (n) => (n === null || n === undefined ? "—" : n < 1 ? n.toFixed(3) : n.toFixed(1));

/** Notes on reading the main-vs-branch rows, printed under every report. */
const CAVEATS = [
  "Unless `--main` names a ref that already contains fix-explore-tests-and-callees, " +
    "the main build predates it: B (index-one-edit) main vs branch then mixes that " +
    "change's resolution cost with this one's and is not this change's delta alone.",
  "Full runs skip the detached-owners query (only per-file runs scope resolution to " +
    "it), so B branch carries no cost for it.",
];

function markdown(result) {
  const e = result.environment;
  const lines = [
    "## Reindex-on-edit benchmark",
    "",
    `- Date: ${e.date}`,
    `- OS: ${e.os} · CPU: ${e.cpu} ×${e.cpus} · Node ${e.node}`,
    `- main: ${e.main.ref} @ ${e.main.sha}`,
    `- branch: ${e.branch.ref} @ ${e.branch.sha}`,
    `- Iterations: ${e.iterations} (after ${e.warmup} warm-ups) · fixture files: ${e.fixtureFiles}`,
    "",
    "| Case | Ref | n | median ms | p95 ms | min ms | max ms |",
    "|------|-----|---|-----------|--------|--------|--------|",
  ];
  for (const row of result.cases) {
    for (const label of ["main", "branch"]) {
      const s = row[label];
      if (!s) continue;
      lines.push(
        `| ${row.name} | ${label} | ${s.n} | ${fmt(s.median)} | ${fmt(s.p95)} | ${fmt(s.min)} | ${fmt(s.max)} |`,
      );
    }
  }
  lines.push("", "### Budgets", "");
  for (const b of result.budgets)
    lines.push(`- ${b.ok ? "PASS" : "FAIL"} — ${b.rule}: ${b.detail}`);
  lines.push("", "### Caveats", "", ...CAVEATS.map((c) => `- ${c}`));
  lines.push("");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "speclaw-bench-rf-"));
  const cleanup = () => {
    if (!opts.keep) fs.rmSync(root, { recursive: true, force: true });
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  try {
    // Sandboxed HOME for every speclaw run (update-check cache).
    const home = path.join(root, "home");
    fs.mkdirSync(home, { recursive: true });
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      NO_COLOR: "1",
      CI: "1",
      SPECLAW_NO_UPDATE_NOTIFIER: "1",
    };
    delete env.FORCE_COLOR;
    delete env.CLAUDE_PROJECT_DIR;

    const builds = {
      main: buildRef("main", opts.main, root, opts),
      branch: buildRef("branch", opts.branch, root, opts),
    };
    const { REINDEX_FILE_COMMAND: command } = await import(
      pathToFileURL(path.join(builds.branch.dir, "dist", "modules", "foundation", "hooks.js")).href
    );
    if (typeof command !== "string")
      throw new Error("branch build exports no REINDEX_FILE_COMMAND");

    const fixtures = {
      main: makeFixture(builds.main, builds.branch.dir, root, env, false),
      branch: makeFixture(builds.branch, builds.branch.dir, root, env, true),
    };

    const cases = [];
    log("A index-noop [main]");
    const mainNoop = indexNoop(builds.main, fixtures.main, env, opts.iterations);
    log("A index-noop [branch]");
    const branchNoop = indexNoop(builds.branch, fixtures.branch, env, opts.iterations);
    cases.push({ name: "A index-noop", main: mainNoop, branch: branchNoop });
    log("B index-one-edit [main]");
    const mainEdit = indexOneEdit(builds.main, fixtures.main, env, opts.iterations);
    log("B index-one-edit [branch]");
    const branchEdit = indexOneEdit(builds.branch, fixtures.branch, env, opts.iterations);
    cases.push({ name: "B index-one-edit", main: mainEdit, branch: branchEdit });
    log("C hook-wall [branch]");
    const hook = hookWall(command, fixtures.branch, env, opts.iterations);
    cases.push({ name: "C hook-wall", main: null, branch: hook });
    log("D reindex-file-edit [branch]");
    const perFile = reindexFileEdit(builds.branch, fixtures.branch, env, opts.iterations);
    cases.push({ name: "D reindex-file-edit", main: null, branch: perFile });

    const budgets = [
      {
        rule: "C hook-wall median < A index-noop median (branch)",
        ok: hook.median < branchNoop.median,
        detail: `${fmt(hook.median)} ms vs ${fmt(branchNoop.median)} ms`,
      },
      {
        rule: "D reindex-file-edit median (branch) < B index-one-edit median (main)",
        ok: perFile.median < mainEdit.median,
        detail: `${fmt(perFile.median)} ms vs ${fmt(mainEdit.median)} ms`,
      },
      {
        rule: "branch A index-noop median ≤ main",
        ok: branchNoop.median <= mainNoop.median,
        detail: `${fmt(branchNoop.median)} ms vs ${fmt(mainNoop.median)} ms`,
      },
    ];

    const result = {
      environment: {
        date: new Date().toISOString(),
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        cpu: os.cpus()[0]?.model ?? "unknown",
        cpus: os.cpus().length,
        node: process.version,
        main: { ref: builds.main.ref, sha: builds.main.sha },
        branch: { ref: builds.branch.ref, sha: builds.branch.sha },
        iterations: opts.iterations,
        warmup: WARMUP,
        fixtureFiles: fs.readdirSync(fixtures.branch, { recursive: true }).length,
      },
      cases,
      budgets,
    };
    if (opts.json === "-") process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else {
      if (opts.json)
        fs.writeFileSync(path.resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
      process.stdout.write(markdown(result));
    }
    if (budgets.some((b) => !b.ok)) process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(`bench: ${err.message}`);
  process.exit(1);
});
