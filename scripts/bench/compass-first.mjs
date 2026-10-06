#!/usr/bin/env node
/**
 * Compass-first benchmark: `main` vs the enforce-compass-first branch.
 *
 * Builds each ref in a throwaway copy under os.tmpdir(), then times the
 * hook/advance/index paths the change touches (micro mode, default) and,
 * opt-in, a headless explorer agent run per ref (`--agent`). Every fixture is
 * a temp copy; the user's repo is only read (`git archive` / `git ls-files`),
 * never written, and speclaw CLI runs get a sandboxed HOME. Temp dirs are
 * removed on exit unless `--keep`. The only writes outside the temp dir are
 * the `--json <file>` the caller names and, with `--link-node-modules`,
 * whatever the build tooling writes into the shared node_modules.
 *
 * Each ref runs its OWN build: the build's package.json version is stamped
 * `<version>+bench-<label>`, the CLI must report that stamp, and every agent
 * fixture's `.mcp.json` speclaw server is pinned to `node <build>/dist/cli/index.js
 * mcp` (init writes the published `npx` entry) and verified with an MCP
 * `initialize` handshake before the agent runs.
 *
 * Usage:
 *   node scripts/bench/compass-first.mjs [--main main] [--branch WORKTREE|<ref>]
 *     [--iterations 30] [--cases a,b] [--json [file]] [--keep]
 *     [--link-node-modules] [--agent] [--agent-runs 3] [--agent-timeout 900]
 *     [--check-builds]
 *
 * `--check-builds` only verifies that each ref's CLI and pinned MCP server are
 * that ref's build (no timing), then exits.
 *
 * `--branch WORKTREE` (default) snapshots the current working tree, so the
 * branch can be measured before it is committed. `--link-node-modules` symlinks
 * the repo's node_modules into each copy instead of running `npm ci` (faster;
 * only valid when both refs share a lockfile).
 *
 * Plain Node ESM with node: modules only (design §8).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WARMUP = 3;
const MIN_ITERATIONS = 20;
const CALL_LOG = path.join(".speclaw", "compass-calls.jsonl");
const ROTATE_AT = 256 * 1024;
const EVIDENCE = new Set([
  "compass_explore",
  "compass_find",
  "compass_diff_context",
  "compass_impact",
  "compass_trace",
  "compass_search",
  "compass_recall",
]);
// Never copied into a fixture, even when untracked and not ignored: they can
// hold credentials or machine-local state.
const NEVER_COPY = [
  /^\.mcp\.json$/,
  /^\.env/,
  /settings\.local\.json$/,
  /^\.idea\//,
  /^\.speclaw\//,
];
// Untracked files are copied only from these roots (the branch's new code).
const UNTRACKED_ROOTS = ["src/", "test/", "scripts/", "lawbook/", "docs/"];
const AGENT_PROMPT =
  "Explore how a Cortex advance is persisted and who calls it. Follow the explore " +
  "skill and return the brief for the planner. Do not edit any file.";

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = {
    main: "main",
    branch: "WORKTREE",
    iterations: 30,
    cases: null,
    json: null,
    keep: false,
    linkNodeModules: false,
    agent: false,
    agentRuns: 3,
    agentTimeout: 900,
    checkBuilds: false,
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
    else if (a === "--cases")
      out.cases = next()
        .split(",")
        .map((s) => s.trim());
    else if (a === "--json") {
      const v = argv[i + 1];
      out.json = v && !v.startsWith("--") ? (i++, v) : "-";
    } else if (a === "--keep") out.keep = true;
    else if (a === "--link-node-modules") out.linkNodeModules = true;
    else if (a === "--agent") out.agent = true;
    else if (a === "--check-builds") out.checkBuilds = true;
    else if (a === "--agent-runs") out.agentRuns = Number(next());
    else if (a === "--agent-timeout") out.agentTimeout = Number(next());
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  if (!Number.isInteger(out.iterations) || out.iterations < MIN_ITERATIONS) {
    throw new Error(`--iterations must be an integer ≥ ${MIN_ITERATIONS}`);
  }
  if (!Number.isInteger(out.agentRuns) || out.agentRuns < 3) {
    throw new Error("--agent-runs must be an integer ≥ 3");
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

function clearCallLog(dir) {
  for (const f of [CALL_LOG, CALL_LOG + ".1"]) fs.rmSync(path.join(dir, f), { force: true });
}

function appendEvidence(dir) {
  const file = path.join(dir, CALL_LOG);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(
    file,
    JSON.stringify({ at: new Date().toISOString(), tool: "compass_find" }) + "\n",
  );
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
  // Stamp the build so its CLI and MCP server identify themselves uniquely
  // (pkgVersion() reads this package.json at runtime; the npm release cannot
  // report it).
  const pkgFile = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  const stamp = `${pkg.version}+bench-${label}`;
  fs.writeFileSync(pkgFile, JSON.stringify({ ...pkg, version: stamp }, null, 2) + "\n");
  return {
    label,
    dir,
    cli: path.join(dir, "dist", "cli", "index.js"),
    stamp,
    ...describeRef(ref),
  };
}

/** Fail unless `node <build.cli> --version` reports this build's stamp. */
function assertCliIsBuild(build, env) {
  const out = sh("node", [build.cli, "--version"], { env }).stdout.trim();
  if (!out.includes(build.stamp)) {
    throw new Error(`[${build.label}] CLI reports "${out}", expected build stamp ${build.stamp}`);
  }
}

/**
 * Point the fixture's speclaw MCP server at this ref's build. Hooks are
 * `mcp_tool` entries addressed by server name, so they follow the same entry.
 */
function pinMcpToBuild(dir, build) {
  const file = path.join(dir, ".mcp.json");
  assertInside(path.dirname(dir), file);
  const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  cfg.mcpServers = {
    ...(cfg.mcpServers ?? {}),
    speclaw: { type: "stdio", command: process.execPath, args: [build.cli, "mcp"] },
  };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  const settings = path.join(dir, ".claude", "settings.json");
  if (fs.existsSync(settings)) {
    const text = fs.readFileSync(settings, "utf8");
    for (const m of text.matchAll(/"server"\s*:\s*"([^"]+)"/g)) {
      if (!cfg.mcpServers[m[1]]) {
        throw new Error(`[${build.label}] hook server "${m[1]}" is not in ${file}`);
      }
    }
  }
}

/**
 * Start the speclaw server exactly as `.mcp.json` configures it, send an MCP
 * `initialize`, and fail unless it is this ref's build (path and version stamp).
 */
async function assertMcpIsBuild(dir, build, env) {
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, ".mcp.json"), "utf8"));
  const server = cfg.mcpServers?.speclaw;
  if (!server || server.args?.[0] !== build.cli) {
    throw new Error(`[${build.label}] .mcp.json speclaw server is not ${build.cli}`);
  }
  const child = spawn(server.command, server.args, { cwd: dir, env, stdio: "pipe" });
  try {
    const version = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MCP initialize timed out")), 20000);
      let buf = "";
      child.on("error", reject);
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        for (const line of buf.split("\n").slice(0, -1)) {
          try {
            const msg = JSON.parse(line);
            if (msg.id === 1) {
              clearTimeout(timer);
              resolve(msg.result?.serverInfo?.version ?? null);
            }
          } catch {
            /* not a JSON-RPC line */
          }
        }
        buf = buf.slice(buf.lastIndexOf("\n") + 1);
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "speclaw-bench", version: "0" },
          },
        }) + "\n",
      );
    });
    if (version !== build.stamp) {
      throw new Error(
        `[${build.label}] MCP server reports version ${version}, expected build stamp ${build.stamp}`,
      );
    }
  } finally {
    child.kill();
  }
}

/** Same fixture content for both refs: the branch tree, initialised by each ref's CLI. */
function makeFixture(build, sourceDir, root, env) {
  const dir = path.join(root, build.label, "fixture");
  assertInside(root, dir);
  fs.cpSync(sourceDir, dir, {
    recursive: true,
    filter: (p) => !/[/\\](node_modules|dist|dist-test)([/\\]|$)/.test(p),
  });
  sh("git", ["init", "-q"], { cwd: dir });
  sh("git", ["add", "-A"], { cwd: dir });
  sh(
    "git",
    ["-c", "user.name=bench", "-c", "user.email=bench@localhost", "commit", "-qm", "fixture"],
    {
      cwd: dir,
    },
  );
  log(`[${build.label}] speclaw init (fixture)`);
  sh("node", [build.cli, "init", "--yes", "--agents", "claude"], { cwd: dir, env });
  pinMcpToBuild(dir, build);
  const cfg = path.join(dir, "lawbook", "config.yaml");
  if (fs.existsSync(cfg)) {
    const text = fs.readFileSync(cfg, "utf8").replace(/^compassGate\s*:.*$/m, "");
    fs.writeFileSync(cfg, text.trimEnd() + "\ncompassGate: warn\n");
  }
  return dir;
}

// ---------------------------------------------------------------- micro cases

const PAYLOADS = {
  read: {
    hook_event_name: "PostToolUse",
    tool_name: "Read",
    tool_input: { file_path: "src/server.ts" },
  },
  grep: {
    hook_event_name: "PostToolUse",
    tool_name: "Grep",
    tool_input: { path: "src", pattern: "handleHarness" },
  },
  glob: {
    hook_event_name: "PostToolUse",
    tool_name: "Glob",
    tool_input: { path: "src", pattern: "src/**/*.ts" },
  },
  write: {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: "src/x.ts" },
  },
};

function cliCheck(build, fixture, env, payload) {
  const r = sh("node", [build.cli, "check", "--hook-payload", "-"], {
    cwd: fixture,
    env,
    input: JSON.stringify(payload),
    check: false,
  });
  if (r.status !== 0 && r.status !== 2) throw new Error(`check exited ${r.status}: ${r.stderr}`);
  return r.stdout;
}

/** Run `iterations` timed samples after WARMUP untimed ones; `before` is untimed. */
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

function microCases() {
  const cases = [];
  for (const [kind, payload] of [
    ["read", PAYLOADS.read],
    ["grep", PAYLOADS.grep],
    ["glob", PAYLOADS.glob],
  ]) {
    // first-hit: empty call log, so the nudge path runs on every sample.
    cases.push({
      name: `check-post-${kind}:first-hit`,
      budget: "nudge",
      run: (ctx) => {
        const res = sample(
          ctx.iterations,
          () => cliCheck(ctx.build, ctx.fixture, ctx.env, payload),
          () => clearCallLog(ctx.fixture),
        );
        // Sanity probe: did this ref's CLI actually emit the nudge on a cold log?
        clearCallLog(ctx.fixture);
        res.nudged = cliCheck(ctx.build, ctx.fixture, ctx.env, payload).includes("Compass first");
        return res;
      },
    });
    // steady: the log keeps the nudge entry, so later samples are rate-limited.
    cases.push({
      name: `check-post-${kind}:steady`,
      budget: "nudge",
      run: (ctx) => {
        clearCallLog(ctx.fixture);
        return sample(ctx.iterations, () => cliCheck(ctx.build, ctx.fixture, ctx.env, payload));
      },
    });
    // in-process: the hook is an mcp_tool call, so this is the cost the agent waits on.
    cases.push({
      name: `check-post-${kind}:in-process`,
      budget: "nudge",
      run: async (ctx) => {
        const mod = await import(
          pathToFileURL(path.join(ctx.build.dir, "dist/modules/foundation/check.js")).href
        );
        const args = {
          projectPath: ctx.fixture,
          event: "PostToolUse",
          toolName: payload.tool_name,
          payload,
        };
        return sample(
          ctx.iterations,
          () => mod.checkAction(args),
          () => clearCallLog(ctx.fixture),
        );
      },
    });
  }
  cases.push({
    name: "check-pre-write",
    budget: "pre-write",
    run: (ctx) =>
      sample(ctx.iterations, () => cliCheck(ctx.build, ctx.fixture, ctx.env, PAYLOADS.write)),
  });
  cases.push({
    name: "cortex-advance",
    budget: "advance",
    run: (ctx) => {
      const changes = path.join(ctx.fixture, "lawbook", "changes");
      const name = (i) => `bench-advance-${i}`;
      const res = sample(
        ctx.iterations,
        (i) => {
          sh("node", [ctx.build.cli, "cortex", "advance", "--change", name(i), "--json"], {
            cwd: ctx.fixture,
            env: ctx.env,
          });
        },
        (i) => {
          fs.rmSync(path.join(changes, name(i)), { recursive: true, force: true });
          fs.mkdirSync(path.join(changes, name(i)), { recursive: true });
          sh("node", [ctx.build.cli, "cortex", "start", "--change", name(i), "--json"], {
            cwd: ctx.fixture,
            env: ctx.env,
          });
          appendEvidence(ctx.fixture); // populated log: the gate is satisfied
        },
      );
      for (const d of fs.readdirSync(changes)) {
        if (d.startsWith("bench-advance-"))
          fs.rmSync(path.join(changes, d), { recursive: true, force: true });
      }
      return res;
    },
  });
  cases.push({
    name: "index-noop",
    budget: "index",
    run: (ctx) => {
      const res = sample(ctx.iterations, () =>
        sh("node", [ctx.build.cli, "index"], { cwd: ctx.fixture, env: ctx.env }),
      );
      const j = sh("node", [ctx.build.cli, "index", "--json"], {
        cwd: ctx.fixture,
        env: ctx.env,
        check: false,
      });
      try {
        const parsed = JSON.parse(j.stdout);
        res.totals = parsed.totals ?? null;
      } catch {
        res.totals = null; // main has no --json for index
      }
      return res;
    },
  });
  cases.push({
    name: "call-log-append",
    budget: "append",
    branchOnly: true,
    run: async (ctx) => {
      const file = path.join(ctx.build.dir, "dist/shared/compass-calls.js");
      if (!fs.existsSync(file)) return null;
      const mod = await import(pathToFileURL(file).href);
      const dir = fs.mkdtempSync(path.join(ctx.root, "append-"));
      // Seed the log just under the cap so the run includes one rotation.
      const line = JSON.stringify({ at: new Date().toISOString(), tool: "compass_find" }) + "\n";
      fs.mkdirSync(path.join(dir, ".speclaw"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, CALL_LOG),
        line.repeat(Math.floor((ROTATE_AT - 2048) / line.length)),
      );
      const per = [];
      for (let i = 0; i < 1000; i++)
        per.push(time(() => mod.recordCompassCall(dir, "compass_find")));
      const rotated = fs.existsSync(path.join(dir, CALL_LOG + ".1"));
      return { ...stats(per), unit: "ms/call", calls: 1000, rotated };
    },
  });
  return cases;
}

function budgetVerdict(kind, main, branch) {
  if (!branch) return "n/a";
  switch (kind) {
    case "nudge":
      return branch.p95 < 50 ? "PASS (p95<50ms)" : "FAIL (p95≥50ms)";
    case "pre-write":
      return !main || branch.median <= Math.max(main.median * 1.1, main.median + 2)
        ? "PASS (≤+10% or +2ms)"
        : "FAIL";
    case "advance":
      return !main || branch.median <= Math.max(main.median * 1.1, main.median + 5)
        ? "PASS (≤+10% or +5ms)"
        : "FAIL";
    case "index":
      return !main || branch.median <= main.median * 1.1 ? "PASS (≤+10%)" : "FAIL";
    case "append":
      return branch.p95 < 1 ? "PASS (p95<1ms/call)" : "FAIL";
    default:
      return "n/a";
  }
}

// ---------------------------------------------------------------- agent mode

function hasClaude() {
  return spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;
}

function frontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: m[2] };
}

function parseStream(stdout) {
  const tools = [];
  let nudge = false;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === "assistant") {
      for (const block of ev.message?.content ?? []) {
        if (block.type === "tool_use")
          tools.push(String(block.name).replace(/^mcp__speclaw__/, ""));
      }
    } else if (line.includes("Compass first:")) {
      nudge = true;
    }
  }
  const evidence = tools.filter((t) => EVIDENCE.has(t)).length;
  const reads = tools.filter((t) => t === "Read" || t === "Grep" || t === "Glob").length;
  return {
    toolCalls: tools.length,
    evidence,
    compassIndex: tools.filter((t) => t === "compass_index").length,
    readGrepGlob: reads,
    evidenceShare: evidence + reads === 0 ? null : evidence / (evidence + reads),
    nudge,
  };
}

async function agentRun(build, fixtureTemplate, root, env, opts, i) {
  const dir = path.join(root, build.label, `agent-${i}`);
  assertInside(root, dir);
  fs.cpSync(fixtureTemplate, dir, { recursive: true });
  // init wrote absolute paths of the template into the MCP config and hooks; re-init here.
  sh("node", [build.cli, "init", "--yes", "--agents", "claude"], { cwd: dir, env });
  pinMcpToBuild(dir, build);
  await assertMcpIsBuild(dir, build, env);
  clearCallLog(dir);
  const change = "bench-agent";
  fs.mkdirSync(path.join(dir, "lawbook", "changes", change), { recursive: true });
  sh("node", [build.cli, "cortex", "start", "--change", change, "--json"], { cwd: dir, env });

  const agentFile = path.join(dir, "ai-specs", "agents", "explorer.md");
  const { meta, body } = frontmatter(
    fs.existsSync(agentFile) ? fs.readFileSync(agentFile, "utf8") : "",
  );
  const allowed = (meta.tools ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "CallMcpTool");
  const disallowed = (meta.disallowedTools ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const args = [
    "-p",
    AGENT_PROMPT,
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    body,
    "--mcp-config",
    path.join(dir, ".mcp.json"),
    "--strict-mcp-config",
    "--setting-sources",
    "project",
  ];
  if (allowed.length) args.push("--allowedTools", allowed.join(","));
  if (disallowed.length) args.push("--disallowedTools", disallowed.join(","));
  log(`[${build.label}] agent run ${i + 1}/${opts.agentRuns}`);
  const t0 = process.hrtime.bigint();
  // Real HOME here: the claude CLI needs its credentials. It may write its own
  // session transcript under its config dir; the fixture itself stays in temp.
  const r = spawnSync("claude", args, {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    timeout: opts.agentTimeout * 1000,
  });
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const metrics = parseStream(r.stdout ?? "");
  const adv = sh("node", [build.cli, "cortex", "advance", "--change", change, "--json"], {
    cwd: dir,
    env,
    check: false,
  });
  let compassEvidence = null;
  let warnings = null;
  try {
    const parsed = JSON.parse(adv.stdout);
    compassEvidence = parsed.compassEvidence ?? null;
    warnings = parsed.warnings ?? null;
  } catch {
    /* advance output not JSON (e.g. strict rejection) */
  }
  return {
    run: i + 1,
    exit: r.status,
    timedOut: r.error?.code === "ETIMEDOUT",
    wallMs,
    ...metrics,
    compassEvidence,
    warnings,
  };
}

function summarizeAgent(runs) {
  const keys = ["wallMs", "toolCalls", "evidence", "compassIndex", "readGrepGlob", "evidenceShare"];
  const out = {};
  for (const k of keys) {
    const v = runs.map((r) => r[k]).filter((x) => typeof x === "number");
    out[k] = v.length
      ? { mean: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) }
      : null;
  }
  out.nudgeRuns = runs.filter((r) => r.nudge).length;
  return out;
}

// ---------------------------------------------------------------- report

const fmt = (n) => (n === null || n === undefined ? "—" : n < 1 ? n.toFixed(3) : n.toFixed(1));

function markdown(result) {
  const e = result.environment;
  const lines = [
    "# Compass-first benchmark",
    "",
    `- Date: ${e.date}`,
    `- OS: ${e.os} · CPU: ${e.cpu} × ${e.cpus} · Node ${e.node}`,
    `- main: ${e.main.ref} @ ${e.main.sha} (build ${e.main.build})`,
    `- branch: ${e.branch.ref} @ ${e.branch.sha} (build ${e.branch.build})`,
    `- Iterations: ${e.iterations} (+${WARMUP} warm-up) · times in ms`,
    "",
    "| Case | main median | main p95 | branch median | branch p95 | Δ median | Δ% | Budget |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of result.micro) {
    const m = c.main;
    const b = c.branch;
    const d = m && b ? b.median - m.median : null;
    const pct = m && b && m.median > 0 ? ((b.median - m.median) / m.median) * 100 : null;
    lines.push(
      `| ${c.name} | ${fmt(m?.median)} | ${fmt(m?.p95)} | ${fmt(b?.median)} | ${fmt(b?.p95)} | ` +
        `${d === null ? "—" : (d >= 0 ? "+" : "") + fmt(d)} | ${pct === null ? "—" : (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%"} | ${c.verdict} |`,
    );
  }
  lines.push(
    "",
    "`main` has no nudge, gate, or call log: its column is the baseline cost of the same command. `call-log-append` is branch only (per call).",
  );
  const probes = result.micro.filter((c) => c.name.endsWith(":first-hit"));
  if (probes.length) {
    lines.push(
      "Nudge emitted on a cold log: " +
        probes
          .map((c) => `${c.name} main=${c.main?.nudged ?? "—"} branch=${c.branch?.nudged ?? "—"}`)
          .join(" · "),
    );
  }
  const app = result.micro.find((c) => c.name === "call-log-append");
  if (app?.branch)
    lines.push(
      `call-log-append: ${app.branch.calls} calls, rotation exercised: ${app.branch.rotated}`,
    );
  const idx = result.micro.find((c) => c.name === "index-noop");
  if (idx?.branch?.totals) lines.push(`Branch index totals: ${JSON.stringify(idx.branch.totals)}`);
  if (result.agent) {
    lines.push("", "## Agent benchmark", "");
    if (result.agent.skipped) lines.push(`Skipped: ${result.agent.skipped}`);
    else {
      lines.push(
        "| Ref | Run | Wall s | Tools | Evidence | compass_index | Read/Grep/Glob | Share | Nudge | compassEvidence | warnings |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      );
      for (const label of ["main", "branch"]) {
        for (const r of result.agent[label].runs) {
          lines.push(
            `| ${label} | ${r.run} | ${(r.wallMs / 1000).toFixed(1)} | ${r.toolCalls} | ${r.evidence} | ${r.compassIndex} | ${r.readGrepGlob} | ` +
              `${r.evidenceShare === null ? "—" : (r.evidenceShare * 100).toFixed(0) + "%"} | ${r.nudge ? "yes" : "no"} | ` +
              `${r.compassEvidence ? JSON.stringify(r.compassEvidence) : "—"} | ${r.warnings?.length ? r.warnings.join("; ") : "—"} |`,
          );
        }
      }
      lines.push(
        "",
        "Agent runs are nondeterministic: raw per-run numbers, no significance claim.",
      );
    }
  }
  return lines.join("\n") + "\n";
}

function log(msg) {
  process.stderr.write(`bench: ${msg}\n`);
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "speclaw-bench-"));
  const cleanup = () => {
    if (!opts.keep) fs.rmSync(root, { recursive: true, force: true });
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  try {
    // Sandboxed HOME for every speclaw CLI run (update-check cache, telemetry).
    const home = path.join(root, "home");
    fs.mkdirSync(home, { recursive: true });
    const env = { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1", CI: "1" };
    delete env.FORCE_COLOR;

    const builds = {
      main: buildRef("main", opts.main, root, opts),
      branch: buildRef("branch", opts.branch, root, opts),
    };
    const fixtures = {
      main: makeFixture(builds.main, builds.branch.dir, root, env),
      branch: makeFixture(builds.branch, builds.branch.dir, root, env),
    };

    // Every measurement below must hit the ref's own build, never a global speclaw.
    for (const label of ["main", "branch"]) assertCliIsBuild(builds[label], env);
    if (opts.checkBuilds) {
      for (const label of ["main", "branch"]) {
        await assertMcpIsBuild(fixtures[label], builds[label], env);
        log(`[${label}] CLI and MCP server are build ${builds[label].stamp}`);
      }
      return;
    }

    const micro = [];
    for (const c of microCases()) {
      if (opts.cases && !opts.cases.some((n) => c.name === n || c.name.startsWith(n + ":")))
        continue;
      const row = { name: c.name };
      for (const label of ["main", "branch"]) {
        if (c.branchOnly && label === "main") {
          row.main = null;
          continue;
        }
        log(`${c.name} [${label}]`);
        row[label] = await c.run({
          build: builds[label],
          fixture: fixtures[label],
          env,
          root,
          iterations: opts.iterations,
        });
      }
      row.verdict = budgetVerdict(c.budget, row.main, row.branch);
      micro.push(row);
    }

    let agent = null;
    if (opts.agent) {
      if (!hasClaude()) agent = { skipped: "the `claude` CLI is not on PATH" };
      else {
        // The branch build must nudge on a cold log, or the agent runs are meaningless.
        clearCallLog(fixtures.branch);
        if (
          !cliCheck(builds.branch, fixtures.branch, env, PAYLOADS.read).includes("Compass first")
        ) {
          throw new Error(
            "[branch] build does not emit the Compass-first nudge; refusing agent runs",
          );
        }
        clearCallLog(fixtures.branch);
        agent = {};
        for (const label of ["main", "branch"]) {
          const runs = [];
          for (let i = 0; i < opts.agentRuns; i++) {
            runs.push(await agentRun(builds[label], fixtures[label], root, env, opts, i));
          }
          agent[label] = { runs, summary: summarizeAgent(runs) };
        }
      }
    }

    const result = {
      environment: {
        date: new Date().toISOString(),
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        cpu: os.cpus()[0]?.model ?? "unknown",
        cpus: os.cpus().length,
        node: process.version,
        main: { ref: builds.main.ref, sha: builds.main.sha, build: builds.main.stamp },
        branch: { ref: builds.branch.ref, sha: builds.branch.sha, build: builds.branch.stamp },
        iterations: opts.iterations,
        warmup: WARMUP,
      },
      micro,
      agent,
    };
    if (opts.json === "-") process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else {
      if (opts.json)
        fs.writeFileSync(path.resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
      process.stdout.write(markdown(result));
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(`bench: ${err.message}`);
  process.exit(1);
});
