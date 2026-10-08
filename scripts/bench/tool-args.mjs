#!/usr/bin/env node
/**
 * Tool-argument benchmark: `main` vs the tool-arg-friction branch.
 *
 * Replays the speclaw MCP calls that failed in real ftd-admin-finanzas sessions
 * on a missing or misnamed argument (same tool, same argument shape, weighted
 * by how often each happened) against each ref's own build, and times the
 * well-formed calls those tools already served, to show the inference adds no
 * latency. Every call runs in a throwaway git repo under os.tmpdir() with a
 * sandboxed HOME; the user's repo is only read (`git archive`). Temp dirs are
 * removed on exit unless `--keep`.
 *
 * Usage:
 *   node scripts/bench/tool-args.mjs [--main main] [--branch HEAD]
 *     [--iterations 20] [--explore-repo DIR] [--json FILE] [--keep]
 *     [--agent-runs N] [--agent-timeout SECONDS]
 *
 * `--agent-runs N` also runs a headless `claude -p` agent N times per ref on the
 * same task (confirm the branch's change at level 2, then archive it), with the
 * fixture's `.mcp.json` pinned to that ref's build, and reports wall time,
 * turns, cost and the speclaw calls that came back as errors.
 *
 * `--explore-repo` names an indexed project (read-only, cloned per ref with
 * `cp -c`) for the compass_explore cases; without it they run on a small
 * generated project.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SDK = path.join(REPO, "node_modules/@modelcontextprotocol/sdk/dist/esm/client");
const { Client } = await import(pathToFileURL(path.join(SDK, "index.js")).href);
const { StdioClientTransport } = await import(pathToFileURL(path.join(SDK, "stdio.js")).href);

const VALID_SPEC = `# Cap

### Requirement: Thing
The system SHALL do the thing.

#### Scenario: happy
- Given a context
- When an action
- Then an outcome
`;

function parseArgs(argv) {
  const out = {
    main: "main",
    branch: "HEAD",
    iterations: 20,
    exploreRepo: null,
    json: null,
    keep: false,
    agentRuns: 0,
    agentTimeout: 600,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--main") out.main = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--iterations") out.iterations = Number(argv[++i]);
    else if (a === "--explore-repo") out.exploreRepo = path.resolve(argv[++i]);
    else if (a === "--json") out.json = path.resolve(argv[++i]);
    else if (a === "--keep") out.keep = true;
    else if (a === "--agent-runs") out.agentRuns = Number(argv[++i]);
    else if (a === "--agent-timeout") out.agentTimeout = Number(argv[++i]);
    else throw new Error(`unknown arg ${a}`);
  }
  return out;
}

function run(cmd, args, cwd, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr}${r.stdout}`);
  return r.stdout;
}

/** Build one ref from `git archive` into its own directory. */
function buildRef(tmp, ref, label) {
  const dir = path.join(tmp, `build-${label}`);
  fs.mkdirSync(dir);
  const tar = spawnSync("git", ["archive", "--format=tar", ref], { cwd: REPO, maxBuffer: 1 << 30 });
  if (tar.status !== 0) throw new Error(`git archive ${ref} failed`);
  spawnSync("tar", ["-x", "-C", dir], { input: tar.stdout });
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "node_modules"));
  run(process.execPath, [path.join(REPO, "node_modules/typescript/bin/tsc"), "-p", "."], dir);
  run(process.execPath, ["scripts/copy-assets.mjs"], dir);
  const sha = run("git", ["rev-parse", "--short", ref], REPO).trim();
  return { label, ref, sha, dir, cli: path.join(dir, "dist/cli/index.js") };
}

async function connect(build, home) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [build.cli, "mcp"],
    env: { ...process.env, HOME: home, SPECLAW_TELEMETRY: "0" },
    stderr: "ignore",
  });
  const client = new Client({ name: "bench", version: "1" });
  await client.connect(transport);
  return client;
}

async function call(client, name, args) {
  const t0 = performance.now();
  try {
    const r = await client.callTool({ name, arguments: args });
    return {
      ms: performance.now() - t0,
      isError: r.isError === true,
      text: r.content?.[0]?.text ?? "",
    };
  } catch (e) {
    return { ms: performance.now() - t0, isError: true, text: String(e?.message ?? e) };
  }
}

// ---------------------------------------------------------------- fixtures

function git(root, ...args) {
  run("git", args, root);
}

/** A throwaway project on `branch` with the given lawbook changes, built with the ref's own engine. */
async function fixture(tmp, build, { branch = "main", changes = [], files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(tmp, "fx-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "b@b");
  git(root, "config", "user.name", "b");
  fs.writeFileSync(path.join(root, "a.js"), "export const a = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  if (branch !== "main") git(root, "checkout", "-qb", branch);
  const engine = await import(
    pathToFileURL(path.join(build.dir, "dist/modules/lawbook/engine.js")).href
  );
  engine.specInit(root);
  for (const c of changes) {
    const base = path.join(root, "lawbook/changes", c.name);
    const w = (rel, body) => {
      fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
      fs.writeFileSync(path.join(base, rel), body);
    };
    w("proposal.md", "# Proposal\nwhy");
    w("design.md", "# Design\napproach");
    w("tasks.md", "- [x] do a thing\n");
    w("specs/cap/spec.md", VALID_SPEC);
    w("reports/backend.md", "# backend\nverdict: pass");
    w(
      "harness.json",
      JSON.stringify({
        version: 1,
        change: c.name,
        stage: "archiving",
        level: 3,
        iteration: 0,
        maxRework: 3,
        verdicts: { review: "PASS", test: "PASS" },
        openQuestions: [],
        history: [],
      }) + "\n",
    );
    // Synced unless the case is the "run sync first" one.
    if (!c.unsynced) {
      fs.mkdirSync(path.join(root, "lawbook/specs/cap"), { recursive: true });
      fs.writeFileSync(path.join(root, "lawbook/specs/cap/spec.md"), VALID_SPEC);
    }
  }
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

// ---------------------------------------------------------------- corpus
// Shapes and counts from the failed calls in ftd-admin-finanzas transcripts
// (2026-09-22 → 2026-10-08). `needsIndex` cases run against the explore repo.

const FAR = "feat/FAR-1360-default-cost-center";
const CORPUS = [
  {
    id: "archive-no-date",
    real: 9,
    tool: "lawbook_change",
    fx: { changes: [{ name: "record-the-approval-trail" }] },
    args: { action: "archive", change: "record-the-approval-trail" },
  },
  {
    id: "alias-archive-no-date",
    real: 5,
    tool: "lawbook_archive",
    fx: { changes: [{ name: "view-as-another-user" }] },
    args: { change: "view-as-another-user" },
  },
  {
    id: "archive-unsynced-spec",
    real: 5,
    tool: "lawbook_change",
    fx: { changes: [{ name: "choose-the-company", unsynced: true }] },
    args: { action: "archive", change: "choose-the-company", date: "2026-10-01" },
  },
  {
    id: "level-set-no-change",
    real: 3,
    tool: "lawbook_change",
    fx: { branch: FAR, changes: [{ name: "default-cost-center" }, { name: "unrelated" }] },
    args: { action: "level", mode: "set", level: 2, reason: "confirmed with the human" },
  },
  {
    id: "level-set-name",
    real: 2,
    tool: "lawbook_change",
    fx: { changes: [{ name: "administer-portal-modules" }] },
    args: { action: "level", mode: "set", name: "administer-portal-modules", level: 3 },
  },
  {
    id: "alias-level-no-change",
    real: 1,
    tool: "lawbook_level",
    fx: { branch: FAR, changes: [{ name: "default-cost-center" }] },
    args: { mode: "set", level: 2, reason: "confirmed with the human" },
  },
  {
    id: "create-action",
    real: 3,
    tool: "lawbook_change",
    fx: {},
    args: { action: "create", name: "administer-portal-modules", level: 3 },
  },
  {
    id: "paths-as-string",
    real: 1,
    tool: "lawbook_change",
    fx: { files: { "src/a.ts": "export const a = 1;\n", "src/b.ts": "export const b = 2;\n" } },
    args: { action: "level", mode: "propose", paths: "src/a.ts,src/b.ts" },
  },
  {
    id: "alias-validate-no-change",
    real: 1,
    tool: "lawbook_validate",
    fx: { changes: [{ name: "keep-build-info" }] },
    args: { strict: "true" },
  },
  {
    id: "explore-query",
    real: 4,
    tool: "compass_explore",
    needsIndex: true,
    args: { query: "purchase request approval decision history audit trail timeline events" },
  },
  // Out of scope here, replayed to show they still fail (with a better message for cortex).
  {
    id: "cortex-undrafted",
    real: 7,
    tool: "cortex",
    fx: { changes: [{ name: "widget" }] },
    expectFail: true,
    args: { action: "start", change: "show-accounting-detail-in-summaries" },
  },
  { id: "speclaw-check-empty", real: 3, tool: "speclaw_check", fx: {}, expectFail: true, args: {} },
];

// Well-formed calls the tools already served: latency must not regress.
const CONTROL = [
  {
    id: "archive(change,date)",
    tool: "lawbook_change",
    fx: { changes: [{ name: "ready" }] },
    args: { action: "archive", change: "ready", date: "2026-10-08" },
  },
  {
    id: "level set(change)",
    tool: "lawbook_change",
    fx: { branch: FAR, changes: [{ name: "default-cost-center" }, { name: "other" }] },
    args: { action: "level", mode: "set", change: "default-cost-center", level: 2, reason: "r" },
  },
  {
    id: "validate(change)",
    tool: "lawbook_change",
    fx: { changes: [{ name: "ready" }] },
    args: { action: "validate", change: "ready" },
  },
  {
    id: "list",
    tool: "lawbook_change",
    fx: { changes: [{ name: "ready" }] },
    args: { action: "list" },
  },
  {
    id: "explore(node)",
    tool: "compass_explore",
    needsIndex: true,
    args: { node: "handleLawbookChange" },
  },
];

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, median: q(0.5), p95: q(0.95), min: s[0], max: s.at(-1) };
}

async function exploreRoot(tmp, build, opts) {
  const dst = path.join(tmp, `explore-${build.label}`);
  if (opts.exploreRepo) {
    run("cp", ["-c", "-R", opts.exploreRepo, dst], tmp);
  } else {
    fs.mkdirSync(path.join(dst, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(dst, "src/trail.ts"),
      "export function approvalHistory() { return []; }\nexport function handleLawbookChange() { return approvalHistory(); }\n",
    );
  }
  run(process.execPath, [build.cli, "index"], dst, {
    ...process.env,
    HOME: path.join(tmp, "home"),
  });
  return dst;
}

const AGENT_PROMPT =
  "The lawbook change for this branch is finished and its gates passed. The human " +
  "confirmed it at ceremony level 2: record that level, then archive the change. " +
  "Use the speclaw MCP tools. Do not edit files by hand.";

/** One headless agent run on a fresh fixture pinned to the ref's build. */
async function agentRun(tmp, build, opts) {
  const root = await fixture(tmp, build, {
    branch: FAR,
    changes: [
      { name: "default-cost-center", unsynced: true },
      { name: "unrelated-draft", unsynced: true },
    ],
  });
  const mcp = path.join(root, ".mcp.json");
  fs.writeFileSync(
    mcp,
    JSON.stringify({
      mcpServers: { speclaw: { command: process.execPath, args: [build.cli, "mcp"] } },
    }),
  );
  const t0 = performance.now();
  const r = spawnSync(
    "claude",
    [
      "-p",
      AGENT_PROMPT,
      "--output-format",
      "stream-json",
      "--verbose",
      "--strict-mcp-config",
      "--mcp-config",
      mcp,
      "--allowedTools",
      "mcp__speclaw__lawbook_change mcp__speclaw__cortex mcp__speclaw__compass_find mcp__speclaw__compass_explore Read Glob Grep Bash(ls:*) Bash(cat:*) Bash(git status:*) Bash(git branch:*)",
    ],
    { cwd: root, encoding: "utf8", timeout: opts.agentTimeout * 1000, maxBuffer: 256 << 20 },
  );
  const wallMs = performance.now() - t0;
  const events = (r.stdout ?? "")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const uses = new Map();
  let speclawCalls = 0;
  let speclawErrors = 0;
  const errors = [];
  for (const e of events) {
    for (const b of e.message?.content ?? []) {
      if (b.type === "tool_use") {
        uses.set(b.id, b.name);
        if (b.name.startsWith("mcp__speclaw__")) speclawCalls++;
      }
      if (
        b.type === "tool_result" &&
        b.is_error &&
        uses.get(b.tool_use_id)?.startsWith("mcp__speclaw__")
      ) {
        speclawErrors++;
        const c = Array.isArray(b.content)
          ? b.content.map((x) => x.text ?? "").join(" ")
          : String(b.content);
        errors.push(c.replace(/\s+/g, " ").slice(0, 120));
      }
    }
  }
  const final = events.findLast((e) => e.type === "result") ?? {};
  const archived = fs
    .readdirSync(path.join(root, "lawbook/changes/archive"))
    .some((d) => d.endsWith("-default-cost-center"));
  const cj = path.join(root, "lawbook/changes/archive");
  return {
    wallMs: Math.round(wallMs),
    turns: final.num_turns ?? null,
    costUsd: final.total_cost_usd ?? null,
    speclawCalls,
    speclawErrors,
    errors,
    archived,
    untouchedOther: fs.existsSync(path.join(root, "lawbook/changes/unrelated-draft")),
    timedOut: r.error?.code === "ETIMEDOUT",
    archiveDir: fs.existsSync(cj) ? fs.readdirSync(cj) : [],
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "speclaw-bench-args-"));
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  const result = { date: new Date().toISOString(), refs: {}, corpus: {}, control: {} };
  try {
    const builds = [buildRef(tmp, opts.main, "main"), buildRef(tmp, opts.branch, "branch")];
    for (const b of builds) {
      result.refs[b.label] = { ref: b.ref, sha: b.sha };
      const version = JSON.parse(fs.readFileSync(path.join(b.dir, "package.json"), "utf8")).version;
      result.refs[b.label].version = version;
      const ex = await exploreRoot(tmp, b, opts);
      const client = await connect(b, home);

      // Corpus: each real failure shape once on a fresh fixture.
      for (const c of CORPUS) {
        const root = c.needsIndex ? ex : await fixture(tmp, b, c.fx);
        const r = await call(client, c.tool, { projectPath: root, ...c.args });
        (result.corpus[c.id] ??= { real: c.real, expectFail: !!c.expectFail })[b.label] = {
          ok: !r.isError,
          ms: Math.round(r.ms),
          text: r.text.replace(/\s+/g, " ").slice(0, 160),
        };
      }

      // Control: well-formed calls, warmed up, N iterations each on fresh fixtures.
      for (const c of CONTROL) {
        const times = [];
        let errors = 0;
        for (let i = 0; i < opts.iterations + 2; i++) {
          const root = c.needsIndex ? ex : await fixture(tmp, b, c.fx);
          const r = await call(client, c.tool, { projectPath: root, ...c.args });
          if (r.isError) errors++;
          if (i >= 2) times.push(r.ms);
        }
        (result.control[c.id] ??= {})[b.label] = { ...stats(times), errors };
      }
      await client.close();

      for (let i = 0; i < opts.agentRuns; i++) {
        const r = await agentRun(tmp, b, opts);
        ((result.agent ??= {})[b.label] ??= []).push(r);
        console.error(`agent ${b.label} #${i + 1}: ${JSON.stringify(r)}`);
      }
    }
  } finally {
    if (!opts.keep) fs.rmSync(tmp, { recursive: true, force: true });
  }

  // Report.
  const weight = (label, inScope) =>
    Object.values(result.corpus)
      .filter((c) => !c.expectFail === inScope)
      .reduce((n, c) => n + (c[label].ok ? c.real : 0), 0);
  const inScopeTotal = Object.values(result.corpus)
    .filter((c) => !c.expectFail)
    .reduce((n, c) => n + c.real, 0);
  result.summary = {
    inScopeRealFailures: inScopeTotal,
    firstTryOk: { main: weight("main", true), branch: weight("branch", true) },
  };
  console.log(
    `refs: main ${result.refs.main.sha} (${result.refs.main.version}) · branch ${result.refs.branch.sha} (${result.refs.branch.version})\n`,
  );
  console.log("corpus (real failed shapes):");
  for (const [id, c] of Object.entries(result.corpus)) {
    console.log(
      `  ${id.padEnd(26)} x${String(c.real).padEnd(2)} main ${c.main.ok ? "ok " : "ERR"} ${String(c.main.ms).padStart(5)}ms | branch ${c.branch.ok ? "ok " : "ERR"} ${String(c.branch.ms).padStart(5)}ms  ${c.branch.ok ? "" : c.branch.text.slice(0, 90)}`,
    );
  }
  console.log(
    `\nin-scope real failures replayed: ${inScopeTotal}; ok on first try: main ${result.summary.firstTryOk.main}, branch ${result.summary.firstTryOk.branch}\n`,
  );
  console.log(`control (well-formed calls, N=${opts.iterations}): median / p95 ms`);
  for (const [id, c] of Object.entries(result.control)) {
    const f = (s) =>
      `${s.median.toFixed(1)} / ${s.p95.toFixed(1)}${s.errors ? ` (${s.errors} err)` : ""}`;
    console.log(`  ${id.padEnd(22)} main ${f(c.main).padEnd(18)} branch ${f(c.branch)}`);
  }
  if (result.agent) {
    console.log(`\nagent runs (claude -p, N=${opts.agentRuns} per ref): median`);
    for (const label of ["main", "branch"]) {
      const rs = result.agent[label] ?? [];
      const med = (k) => stats(rs.map((r) => r[k] ?? 0)).median;
      console.log(
        `  ${label.padEnd(7)} wall ${(med("wallMs") / 1000).toFixed(1)} s · turns ${med("turns")} · $${med("costUsd").toFixed(3)} · speclaw calls ${med("speclawCalls")} · speclaw errors ${rs.map((r) => r.speclawErrors).join("/")} · archived ${rs.filter((r) => r.archived).length}/${rs.length}`,
      );
    }
  }
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(result, null, 2) + "\n");
}

await main();
