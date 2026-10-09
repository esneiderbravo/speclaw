#!/usr/bin/env node
/**
 * Cortex flow benchmark: speclaw's Cortex against one agent alone, on tasks
 * larger than the one-line bugs of `scripts/bench-workflow.sh`.
 *
 * Scenarios (fixtures in `cortex-flow-fixtures.mjs`):
 *
 *   full    A — one agent, no speclaw, implements FEATURE.md (a level 2–3
 *               feature: new module, three touched modules, public entry,
 *               package.json).
 *           B — the same task through the complete Cortex lane: implement →
 *               the level's docs → review → test → archive.
 *           R — review probe: a bug change already built on a branch, with
 *               planted process defects (`--defects`); a Cortex reviewer
 *               reviews it. Measures review time and which defects it caught.
 *               `--control` adds a defect-free probe that should PASS.
 *               `--scenario review` runs only this probe.
 *   fanout  A — one agent builds three large independent modules.
 *           F — the same task through the Cortex fan-out lane (parallel agents).
 *
 * Per run it records wall-clock (process), the agent's own duration, cost and
 * tokens when the agent reports them, tool calls, peak context (largest
 * prompt of one model call), subagents and their overlap, `npm test`, hidden
 * acceptance tests the agent never saw, and the lawbook state Cortex left.
 * It prints a markdown summary with the acceptance bar and writes
 * `results.json` + `summary.md` to the bench temp dir (and `--json` / `--md`).
 *
 * Isolation: every fixture is a fresh git repo under a `mktemp` dir in
 * os.tmpdir(); speclaw setup runs with a sandboxed HOME, and the `speclaw` on
 * the agent's PATH is a shim to this checkout's build (or `--speclaw-dist`)
 * that also pins HOME to the sandbox. This checkout is only read. Agent
 * transcripts are only read. Fixtures are removed at the end unless `--keep`.
 *
 * Agent-agnostic: the agent is a command line, configurable by env.
 *   BENCH_AGENT_CMD          default `claude -p`; the prompt is passed as the
 *                            next argument, run from the fixture root.
 *   BENCH_AGENT_ARGS         flags after the prompt; default for Claude Code:
 *                            `--output-format json --allowedTools <list>`.
 *   BENCH_AGENT_CORTEX_ARGS  extra flags for Cortex modes; default
 *                            `--mcp-config .mcp.json`.
 *   BENCH_AGENT_ID           the `speclaw agent add <id>` to configure (claude).
 *   BENCH_TRANSCRIPTS        where session transcripts live (~/.claude/projects).
 *   BENCH_FULL_CORTEX_PROMPT, BENCH_FANOUT_CORTEX_PROMPT, BENCH_REVIEW_PROMPT
 *                            override the Cortex instructions (see PROMPTS).
 * When the agent prints no Claude-style JSON result, only wall-clock and the
 * repo-state checks are recorded.
 *
 * `--dry-run` swaps the agent for a built-in fake (`--fake-agent`) that applies
 * the reference solutions, runs the real `speclaw ship-on-stop` in Cortex
 * fixtures and writes a review, so the whole pipeline — fixtures, speclaw
 * setup, grading, transcript parsing, summary — runs with no model call.
 *
 * Usage:
 *   node scripts/bench/cortex-flow.mjs [--scenario full|fanout|review|all] [--runs 3]
 *     [--defects stub,real-data,red-first] [--control] [--dry-run]
 *     [--speclaw-dist <dist>] [--timeout-min 40] [--json <file>] [--md <file>]
 *     [--keep]
 *
 * Plain Node ESM with node: modules only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEFECTS,
  FANOUT_ACCEPTANCE,
  FULL_ACCEPTANCE,
  REVIEW_CHANGE,
  writeFanout,
  writeFull,
  writeReviewBase,
  writeReviewChange,
} from "./cortex-flow-fixtures.mjs";

const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), "..", "..");
const TIME_FACTOR_BUDGET = 2;
const REVIEW_BUDGET_S = 90;
const DEFAULT_DEFECTS = ["stub", "real-data", "red-first"];
const CLAUDE_ARGS =
  "--output-format json --allowedTools Read,Edit,Write,Bash,Glob,Grep,Agent,Task,Skill,mcp__speclaw";
const GIT_ID = {
  GIT_AUTHOR_NAME: "bench",
  GIT_AUTHOR_EMAIL: "bench@example.invalid",
  GIT_COMMITTER_NAME: "bench",
  GIT_COMMITTER_EMAIL: "bench@example.invalid",
};

const TASK =
  "Implement the feature described in FEATURE.md. Change nothing unrelated. Make `npm test` pass. Do not ask questions.";
const PROMPTS = {
  fullCortex:
    process.env.BENCH_FULL_CORTEX_PROMPT ??
    "Build it with speclaw's Cortex through archive: implement it with its tests, write what the change's level owes in lawbook/changes/<change>/, have it reviewed (a reviewer writes reports/review.md with PASS or FAIL), tested (discipline reports from the real gate output), and archived with the lawbook_change tool, action archive. You are done when the change is archived.",
  fanoutCortex:
    process.env.BENCH_FANOUT_CORTEX_PROMPT ??
    "The work splits into three large, independent parts: use speclaw's Cortex fan-out lane (one agent per part, in parallel), then integrate and finish.",
  review:
    process.env.BENCH_REVIEW_PROMPT ??
    `Review the change ${REVIEW_CHANGE} on this branch (base: main) as speclaw's Cortex reviewer, following ai-specs/agents/reviewer.md. Write lawbook/changes/${REVIEW_CHANGE}/reports/review.md with "Verdict: PASS" or "Verdict: FAIL" and one finding per problem. Change no other file. Do not ask questions.`,
};

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = {
    scenario: "all",
    runs: 3,
    defects: DEFAULT_DEFECTS,
    control: false,
    dryRun: false,
    speclawDist: path.join(REPO, "dist"),
    timeoutMin: 40,
    json: null,
    md: null,
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      i++;
      return v;
    };
    if (a === "--scenario") out.scenario = next();
    else if (a === "--runs") out.runs = Number(next());
    else if (a === "--defects") out.defects = next() === "none" ? [] : argv[i].split(",");
    else if (a === "--control") out.control = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--speclaw-dist") out.speclawDist = path.resolve(next());
    else if (a === "--timeout-min") out.timeoutMin = Number(next());
    else if (a === "--json") out.json = path.resolve(next());
    else if (a === "--md") out.md = path.resolve(next());
    else if (a === "--keep") out.keep = true;
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(SELF, "utf8").split("*/")[0]);
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!["full", "fanout", "review", "all"].includes(out.scenario))
    throw new Error(`bad --scenario`);
  if (!(out.runs >= 1)) throw new Error("--runs must be ≥ 1");
  for (const d of out.defects) if (!DEFECTS[d]) throw new Error(`unknown defect: ${d}`);
  return out;
}

// ---------------------------------------------------------------- shell

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status ?? (r.signal ? 128 : 1), stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function must(cmd, args, opts) {
  const r = run(cmd, args, opts);
  if (r.code !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.code}): ${r.stderr || r.stdout}`);
  return r;
}

const git = (cwd, ...args) => must("git", args, { cwd, env: { ...process.env, ...GIT_ID } });

// ---------------------------------------------------------------- setup

/** The bench temp dir, the speclaw shim and the environments derived from it. */
function makeBench(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "speclaw-cortex-flow-"));
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  fs.mkdirSync(home);
  fs.mkdirSync(bin);
  const cli = path.join(opts.speclawDist, "cli", "index.js");
  if (!fs.existsSync(cli)) throw new Error(`no speclaw build at ${cli} — run npm run build`);
  // Hooks resolve `speclaw` on PATH: point it at the build under test, with
  // the sandboxed HOME so nothing lands in the user's home.
  fs.writeFileSync(
    path.join(bin, "speclaw"),
    `#!/bin/sh\nHOME='${home}' exec '${process.execPath}' '${cli}' "$@"\n`,
    { mode: 0o755 },
  );
  const transcripts = opts.dryRun
    ? path.join(root, "transcripts")
    : (process.env.BENCH_TRANSCRIPTS ?? path.join(os.homedir(), ".claude", "projects"));
  const agentEnv = {
    ...process.env,
    ...GIT_ID,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  // A parent session's project dir would point hooks at the real checkout.
  delete agentEnv.CLAUDE_PROJECT_DIR;
  delete agentEnv.CLAUDECODE;
  const agent = opts.dryRun
    ? { cmd: `'${process.execPath}' '${SELF}' --fake-agent`, args: "", cortexArgs: "" }
    : {
        cmd: process.env.BENCH_AGENT_CMD ?? "claude -p",
        args: process.env.BENCH_AGENT_ARGS ?? CLAUDE_ARGS,
        cortexArgs: process.env.BENCH_AGENT_CORTEX_ARGS ?? "--mcp-config .mcp.json",
      };
  if (opts.dryRun) agentEnv.BENCH_FAKE_TRANSCRIPTS = transcripts;
  return {
    root,
    home,
    cli,
    transcripts,
    agent,
    agentEnv,
    speclawEnv: { ...process.env, ...GIT_ID, HOME: home },
  };
}

function speclaw(bench, cwd, ...args) {
  return must(process.execPath, [bench.cli, ...args], { cwd, env: bench.speclawEnv });
}

/**
 * A fresh fixture repo: sources on `main`, then the work branch. Cortex
 * fixtures get `speclaw init --minimal`, the agent's hooks, an MCP config
 * pointing at the build under test, and an index.
 */
function makeFixture(bench, label, { write, cortex, branch }) {
  const dir = fs.mkdtempSync(path.join(bench.root, `${label}-`));
  git(dir, "init", "-q", "-b", "main");
  write(dir);
  if (cortex) {
    speclaw(bench, dir, "init", "--minimal");
    speclaw(bench, dir, "agent", "add", process.env.BENCH_AGENT_ID ?? "claude");
    fs.writeFileSync(
      path.join(dir, ".mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            speclaw: {
              type: "stdio",
              command: process.execPath,
              args: [bench.cli, "mcp"],
              env: { HOME: bench.home },
            },
          },
        },
        null,
        2,
      ) + "\n",
    );
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
  git(dir, "checkout", "-qb", branch);
  return dir;
}

/** The review probe: the bug fix already committed on its branch, defects planted. */
function makeReviewFixture(bench, label, defects) {
  const dir = makeFixture(bench, label, {
    write: writeReviewBase,
    cortex: true,
    branch: "fix/ledger-rounding",
  });
  speclaw(bench, dir, "lawbook", "draft", "--bug", REVIEW_CHANGE, "--level", "2");
  writeReviewChange(dir, defects);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "fix(ledger): round half-cents half up");
  speclaw(bench, dir, "index");
  return dir;
}

// ---------------------------------------------------------------- agent

/** Run the agent once in `dir`; returns wall-clock seconds and its parsed result. */
function runAgent(bench, opts, dir, prompt, { cortex, role, mode, defects = [] }) {
  const env = { ...bench.agentEnv, BENCH_PROMPT: prompt, BENCH_ROLE: role, BENCH_MODE: mode };
  if (opts.dryRun) env.BENCH_FAKE_DEFECTS = defects.join(",");
  const extra = cortex ? bench.agent.cortexArgs : "";
  const line = `${bench.agent.cmd} "$BENCH_PROMPT" ${bench.agent.args} ${extra}`;
  const t0 = Date.now();
  const r = spawnSync("sh", ["-c", line], {
    cwd: dir,
    env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: opts.timeoutMin * 60_000,
  });
  const wall = (Date.now() - t0) / 1000;
  const stdout = r.stdout ?? "";
  return {
    wall,
    exit: r.status,
    timedOut: r.error?.code === "ETIMEDOUT",
    stdout,
    result: parseResult(stdout),
  };
}

/** A Claude-style `--output-format json` result, or null for other agents. */
function parseResult(stdout) {
  const tries = [stdout.trim(), stdout.trim().split("\n").pop() ?? ""];
  for (const t of tries) {
    try {
      const d = JSON.parse(t);
      const parsed = Array.isArray(d) ? d.findLast((e) => e.type === "result") : d;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Not JSON: the agent printed text.
    }
  }
  return null;
}

/** Tokens of one model call's prompt: fresh input plus cache reads and writes. */
const promptTokens = (u) =>
  (u?.input_tokens ?? 0) +
  (u?.cache_read_input_tokens ?? 0) +
  (u?.cache_creation_input_tokens ?? 0);

/** Tool calls, peak context and time span of one transcript file. */
function readTranscript(file) {
  const out = { tools: {}, toolCalls: 0, peakContext: 0, first: null, last: null, agentTypes: [] };
  const seen = new Set();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = e.timestamp ? Date.parse(e.timestamp) : NaN;
    if (!Number.isNaN(ts)) {
      out.first = out.first === null ? ts : Math.min(out.first, ts);
      out.last = out.last === null ? ts : Math.max(out.last, ts);
    }
    const msg = e.message;
    if (e.type !== "assistant" || !msg) continue;
    out.peakContext = Math.max(out.peakContext, promptTokens(msg.usage));
    for (const b of Array.isArray(msg.content) ? msg.content : []) {
      if (b?.type !== "tool_use" || seen.has(b.id)) continue;
      seen.add(b.id);
      out.toolCalls++;
      out.tools[b.name] = (out.tools[b.name] ?? 0) + 1;
      if (b.name === "Agent" || b.name === "Task")
        out.agentTypes.push(b.input?.subagent_type ?? "general-purpose");
    }
  }
  return out;
}

/** The session's main transcript and its subagents' (Claude Code layout). */
function sessionMetrics(transcripts, sessionId) {
  if (!sessionId || !fs.existsSync(transcripts)) return null;
  for (const project of fs.readdirSync(transcripts)) {
    const main = path.join(transcripts, project, `${sessionId}.jsonl`);
    if (!fs.existsSync(main)) continue;
    const m = readTranscript(main);
    const subDir = path.join(transcripts, project, sessionId, "subagents");
    const subagents = [];
    if (fs.existsSync(subDir)) {
      for (const f of fs.readdirSync(subDir).filter((n) => n.endsWith(".jsonl"))) {
        const s = readTranscript(path.join(subDir, f));
        let type = "unknown";
        try {
          type = JSON.parse(
            fs.readFileSync(path.join(subDir, f.replace(/\.jsonl$/, ".meta.json")), "utf8"),
          ).agentType;
        } catch {
          // Older layouts carry no meta file.
        }
        subagents.push({
          type,
          seconds: s.first !== null ? (s.last - s.first) / 1000 : null,
          start: s.first,
          end: s.last,
          toolCalls: s.toolCalls,
          peakContext: s.peakContext,
        });
      }
    }
    const tools = { ...m.tools };
    for (const s of subagents) tools[`(subagents)`] = (tools["(subagents)"] ?? 0) + s.toolCalls;
    return {
      toolCalls: m.toolCalls + subagents.reduce((n, s) => n + s.toolCalls, 0),
      mainToolCalls: m.toolCalls,
      tools,
      speclawCalls: Object.entries(m.tools)
        .filter(([k]) => k.startsWith("mcp__speclaw__"))
        .reduce((n, [, v]) => n + v, 0),
      peakContext: m.peakContext,
      peakContextAny: Math.max(m.peakContext, ...subagents.map((s) => s.peakContext)),
      spawned: m.agentTypes,
      subagents,
      maxParallel: maxOverlap(subagents),
    };
  }
  return null;
}

/** Largest number of subagents alive at once. */
function maxOverlap(spans) {
  const ev = spans
    .filter((s) => s.start !== null)
    .flatMap((s) => [
      [s.start, 1],
      [s.end, -1],
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let max = 0;
  for (const [, d] of ev) max = Math.max(max, (cur += d));
  return max;
}

// ---------------------------------------------------------------- grading

/** `npm test` in the fixture. */
function npmTest(dir) {
  return run("npm", ["test", "--silent"], { cwd: dir, timeout: 180_000 }).code === 0;
}

/** Hidden acceptance tests, copied in only after the agent exited. */
function acceptance(dir, files) {
  const hidden = path.join(dir, "acceptance-hidden");
  fs.mkdirSync(hidden, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(hidden, name), body);
  const r = run(
    process.execPath,
    ["--test", "--test-reporter=tap", ...Object.keys(files).map((n) => path.join(hidden, n))],
    {
      cwd: dir,
      timeout: 120_000,
    },
  );
  fs.rmSync(hidden, { recursive: true, force: true });
  const n = (k) => Number(new RegExp(`^# ${k} (\\d+)`, "m").exec(r.stdout)?.[1] ?? 0);
  return { pass: n("pass"), total: n("tests") };
}

/** What Cortex left in lawbook/changes: change dirs, level, review, reports, archive. */
function lawbookState(dir) {
  const changes = path.join(dir, "lawbook", "changes");
  if (!fs.existsSync(changes)) return null;
  const dirs = [];
  for (const n of fs.readdirSync(changes)) {
    if (n === "archive") {
      for (const a of fs.readdirSync(path.join(changes, n)))
        dirs.push({ dir: path.join(changes, n, a), archived: true });
    } else if (fs.statSync(path.join(changes, n)).isDirectory())
      dirs.push({ dir: path.join(changes, n), archived: false });
  }
  const state = { changes: dirs.length, archived: 0, level: null, review: null, reports: [] };
  for (const { dir: c, archived } of dirs) {
    if (archived) state.archived++;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(c, "change.json"), "utf8"));
      state.level = j.confirmedLevel ?? j.level ?? state.level;
    } catch {
      // A change without change.json reports no level.
    }
    const reports = path.join(c, "reports");
    if (!fs.existsSync(reports)) continue;
    for (const f of fs.readdirSync(reports)) {
      if (f === "README.md") continue;
      if (f === "review.md")
        state.review = verdictOf(fs.readFileSync(path.join(reports, f), "utf8"));
      else state.reports.push(f);
    }
  }
  return state;
}

const verdictOf = (text) =>
  /\bFAIL\b/.test(text) ? "FAIL" : /\bPASS\b/.test(text) ? "PASS" : "none";

/**
 * Per planted defect, the patterns a finding must match — all of them, inside
 * one paragraph or list item (or it and the next) — to count as caught.
 */
const DETECT = {
  stub: [
    /design\.md|design (doc|artifact)/i,
    /stub|placeholder|scaffold|template|boilerplate|unfilled|not (been )?(filled|written|completed)|empty|left as/i,
  ],
  "real-data": [
    /ledger\.json|real (data|ledger|file|checkout|repo)|checked[- ]in data|repo(sitory)?'?s? (own |real )?data/i,
    /writ|overwrit|mutat|modif|append|pollut|side[- ]effect|isolat|temp|tmp|mkdtemp|persist|dirty|corrupt/i,
  ],
  "missing-report": [
    /discipline report|reports\/|backend\.md|report/i,
    /missing|\bno\b|absent|lack|without|only (a |the )?readme|not (been )?(written|produced|present)/i,
  ],
  "red-first": [
    /fail(ing|s|ed)? (first|before)|before the fix|red[- ]?(first|green|\/green)|\bred\b|prior to the fix|without the fix|failing output/i,
    /evidence|proof|output|record|document|missing|\bno\b|lack|absent|show/i,
  ],
};

/** Which planted defects a review text names, with the excerpt that matched. */
function detectDefects(text, defects) {
  const chunks = text.split(/\n\s*\n|\n(?=\s*(?:[-*+]|\d+[.)]|#+)\s)/).map((c) => c.trim());
  const out = {};
  for (const d of defects) {
    out[d] = null;
    for (let i = 0; i < chunks.length && !out[d]; i++) {
      const win = chunks[i] + "\n" + (chunks[i + 1] ?? "");
      if (DETECT[d].every((re) => re.test(win))) out[d] = chunks[i].slice(0, 240);
    }
  }
  return out;
}

/** Every review.md the probe left, plus the agent's final message. */
function reviewText(dir, result) {
  const texts = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    for (const n of fs.readdirSync(p)) {
      const f = path.join(p, n);
      if (fs.statSync(f).isDirectory()) walk(f);
      else if (n === "review.md") texts.push(fs.readFileSync(f, "utf8"));
    }
  };
  walk(path.join(dir, "lawbook", "changes"));
  return { file: texts.join("\n\n"), all: [...texts, result?.result ?? ""].join("\n\n") };
}

// ---------------------------------------------------------------- one run

function common(bench, a) {
  const r = a.result;
  const u = r?.usage ?? {};
  return {
    process_s: round(a.wall),
    agent_s: r?.duration_ms !== undefined ? round(r.duration_ms / 1000) : null,
    cost_usd: r?.total_cost_usd ?? null,
    tokens: r ? promptTokens(u) + (u.output_tokens ?? 0) : null,
    turns: r?.num_turns ?? null,
    exit: a.exit,
    timedOut: a.timedOut,
    transcript: sessionMetrics(bench.transcripts, r?.session_id),
  };
}

function runTask(bench, opts, scenario, mode, i) {
  const cortex = mode !== "A";
  const write = scenario === "full" ? writeFull : writeFanout;
  const dir = makeFixture(bench, `${scenario}-${mode}-${i}`, {
    write,
    cortex,
    branch: scenario === "full" ? "feat/coupons" : "feat/utilities",
  });
  if (cortex) speclaw(bench, dir, "index");
  const prompt = !cortex
    ? TASK
    : `${TASK} ${scenario === "full" ? PROMPTS.fullCortex : PROMPTS.fanoutCortex}`;
  const a = runAgent(bench, opts, dir, prompt, { cortex, role: scenario, mode });
  fs.writeFileSync(path.join(bench.root, "raw", `${scenario}-${mode}-${i}.out`), a.stdout);
  const out = {
    ...common(bench, a),
    dir,
    tests: npmTest(dir),
    acceptance: acceptance(dir, scenario === "full" ? FULL_ACCEPTANCE : FANOUT_ACCEPTANCE),
    lawbook: lawbookState(dir),
  };
  const review = out.transcript?.subagents.find((s) => s.type === "reviewer");
  out.reviewSubagent_s =
    review?.seconds !== undefined && review?.seconds !== null ? round(review.seconds) : null;
  return out;
}

function runReview(bench, opts, i, defects, label) {
  const dir = makeReviewFixture(bench, `${label}-${i}`, defects);
  const data = fs.readFileSync(path.join(dir, "data", "ledger.json"), "utf8");
  const a = runAgent(bench, opts, dir, PROMPTS.review, {
    cortex: true,
    role: "review",
    mode: "R",
    defects,
  });
  fs.writeFileSync(path.join(bench.root, "raw", `${label}-${i}.out`), a.stdout);
  const text = reviewText(dir, a.result);
  const caught = detectDefects(text.all, defects);
  return {
    ...common(bench, a),
    dir,
    planted: defects,
    verdict: verdictOf(text.file || text.all),
    reviewWritten: text.file.length > 0,
    caught,
    // A reviewer that runs the planted test writes the fixture's "real" data.
    realDataTouched: fs.readFileSync(path.join(dir, "data", "ledger.json"), "utf8") !== data,
  };
}

// ---------------------------------------------------------------- summary

const round = (x) => Math.round(x * 100) / 100;

function median(xs) {
  const v = xs.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function summarize(runs) {
  const t = (f) => median(runs.map(f));
  return {
    runs: runs.length,
    process_s: t((r) => r.process_s),
    agent_s: t((r) => r.agent_s),
    cost_usd: t((r) => r.cost_usd),
    tokens: t((r) => r.tokens),
    turns: t((r) => r.turns),
    toolCalls: t((r) => r.transcript?.toolCalls),
    peakContext: t((r) => r.transcript?.peakContextAny),
    subagents: t((r) => r.transcript?.subagents.length),
    maxParallel: t((r) => r.transcript?.maxParallel),
    testsPass: runs.filter((r) => r.tests).length,
    acceptance: t((r) => (r.acceptance?.total ? r.acceptance.pass / r.acceptance.total : null)),
    archived: runs.filter((r) => r.lawbook?.archived > 0).length,
    reviewed: runs.filter((r) => r.lawbook?.review && r.lawbook.review !== "none").length,
    reviewSubagent_s: t((r) => r.reviewSubagent_s),
    levels: [...new Set(runs.map((r) => r.lawbook?.level ?? "-"))].join(" "),
  };
}

const fmt = {
  s: (x) => (x === null ? "—" : `${x.toFixed(1)} s`),
  usd: (x) => (x === null ? "—" : `$${x.toFixed(3)}`),
  n: (x) => (x === null ? "—" : Math.round(x).toLocaleString("en-US")),
  pct: (x) => (x === null ? "—" : `${Math.round(x * 100)}%`),
};

function bar(results, opts) {
  const lines = [];
  const check = (ok, text) =>
    lines.push(`- ${ok === null ? "[n/a]" : ok ? "[PASS]" : "[FAIL]"} ${text}`);
  for (const [scenario, cortexMode] of [
    ["full", "B"],
    ["fanout", "F"],
  ]) {
    const s = results.summary[scenario];
    if (!s) continue;
    const a = s.A?.process_s;
    const c = s[cortexMode]?.process_s;
    const has = a > 0 && c > 0;
    const ok = has ? c <= TIME_FACTOR_BUDGET * a : null;
    check(
      ok,
      `${scenario === "full" ? "Full Cortex flow" : "Cortex fan-out"} ≤ ${TIME_FACTOR_BUDGET}× agent alone: ` +
        (has
          ? `${fmt.s(c)} vs limit ${fmt.s(TIME_FACTOR_BUDGET * a)} (${(c / a).toFixed(2)}×)`
          : "no data"),
    );
  }
  const probes = results.runs.review ?? [];
  if (probes.length) {
    const m = median(probes.map((r) => r.process_s));
    check(
      m <= REVIEW_BUDGET_S,
      `Review ≤ ${REVIEW_BUDGET_S} s: median ${fmt.s(m)} (process, per probe: ${probes.map((r) => r.process_s).join(", ")} s)`,
    );
    const per = opts.defects.map(
      (d) => `${d} ${probes.filter((r) => r.caught[d]).length}/${probes.length}`,
    );
    const fails = probes.filter((r) => r.verdict === "FAIL").length;
    const all =
      opts.defects.length > 0 &&
      probes.every((r) => r.verdict === "FAIL" && opts.defects.every((d) => r.caught[d]));
    check(
      opts.defects.length ? all : null,
      `Planted defects caught: ${per.join(", ") || "none planted"}; verdict FAIL ${fails}/${probes.length}`,
    );
  }
  const control = results.runs.control ?? [];
  if (control.length) {
    const ok = control.filter((r) => r.verdict === "PASS").length;
    check(ok === control.length, `Control (no defects) passes review: ${ok}/${control.length}`);
  }
  return lines;
}

function markdown(results, opts) {
  const L = [];
  const meta = results.meta;
  L.push(
    `# Cortex flow benchmark${opts.dryRun ? " — DRY RUN (fake agent, not a measurement)" : ""}`,
    "",
  );
  L.push(
    `**Date:** ${meta.date} · **Agent:** \`${meta.agent}\` · **speclaw:** ${meta.speclawVersion} (\`${meta.speclawDist}\`) · **Runs per mode:** ${opts.runs}`,
    "",
  );
  L.push(
    "Process = wall-clock from launch to exit (CLI start-up and hooks included); agent s = the agent's own duration. Medians across runs. Peak context = the largest prompt one model call sent (any agent).",
    "",
  );
  const head =
    "| Mode | Process | Agent | Cost | Tokens | Turns | Tool calls | Peak context | Subagents | Max parallel | npm test | Hidden acceptance | Level | Reviewed | Reports | Archived |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const names = { A: "A — agent alone", B: "B — full Cortex flow", F: "F — Cortex fan-out" };
  for (const scenario of ["full", "fanout"]) {
    const s = results.summary[scenario];
    if (!s) continue;
    L.push(
      `## ${scenario === "full" ? "Full flow — level 2–3 feature (coupons)" : "Fan-out — three independent modules"}`,
      "",
      head,
      sep,
    );
    for (const [mode, m] of Object.entries(s)) {
      const reports = results.runs[`${scenario}-${mode}`].map(
        (r) => r.lawbook?.reports.join(" ") || "—",
      );
      L.push(
        `| ${names[mode]} | ${fmt.s(m.process_s)} | ${fmt.s(m.agent_s)} | ${fmt.usd(m.cost_usd)} | ${fmt.n(m.tokens)} | ${fmt.n(m.turns)} | ${fmt.n(m.toolCalls)} | ${fmt.n(m.peakContext)} | ${fmt.n(m.subagents)} | ${fmt.n(m.maxParallel)} | ${m.testsPass}/${m.runs} | ${fmt.pct(m.acceptance)} | ${mode === "A" ? "—" : m.levels} | ${mode === "A" ? "—" : `${m.reviewed}/${m.runs}${m.reviewSubagent_s !== null ? ` (${fmt.s(m.reviewSubagent_s)})` : ""}`} | ${mode === "A" ? "—" : [...new Set(reports)].join("; ")} | ${mode === "A" ? "—" : `${m.archived}/${m.runs}`} |`,
      );
    }
    L.push("");
  }
  for (const [key, title] of [
    [
      "review",
      `Review probe — planted: ${opts.defects.map((d) => `\`${d}\` (${DEFECTS[d]})`).join("; ") || "none"}`,
    ],
    ["control", "Review control — no defects planted (should PASS)"],
  ]) {
    const probes = results.runs[key];
    if (!probes?.length) continue;
    L.push(
      `## ${title}`,
      "",
      `| Run | Process | Agent | Cost | Tool calls | Peak context | Verdict | ${opts.defects.map((d) => `${key === "control" ? "Flagged" : "Caught"} \`${d}\``).join(" | ")}${opts.defects.length ? " |" : ""} Real data touched |`,
    );
    L.push(`|---|---|---|---|---|---|---|${opts.defects.map(() => "---|").join("")}---|`);
    probes.forEach((r, i) => {
      const caught = opts.defects.map((d) => (r.caught[d] ? "yes" : "no")).join(" | ");
      L.push(
        `| ${i + 1} | ${fmt.s(r.process_s)} | ${fmt.s(r.agent_s)} | ${fmt.usd(r.cost_usd)} | ${fmt.n(r.transcript?.toolCalls ?? null)} | ${fmt.n(r.transcript?.peakContextAny ?? null)} | ${r.verdict} | ${caught}${caught ? " |" : ""} ${r.realDataTouched ? "yes" : "no"} |`,
      );
    });
    L.push("");
  }
  L.push("## Acceptance bar", "", ...results.bar, "", `Raw results: \`${results.meta.out}\``, "");
  return L.join("\n");
}

// ---------------------------------------------------------------- fake agent

/**
 * The dry run's stand-in agent: applies the reference solution (or writes a
 * review), runs the real Stop hook in Cortex fixtures, and prints a
 * Claude-style JSON result with a matching transcript. It exists to exercise
 * the harness end to end; its numbers mean nothing.
 */
function fakeAgent() {
  const t0 = Date.now();
  const role = process.env.BENCH_ROLE;
  const mode = process.env.BENCH_MODE;
  const cwd = process.cwd();
  const session = `fake-${role}-${mode}-${process.pid}-${t0}`;
  let text = "done";
  const subagents = [];
  if (role === "full" || role === "fanout") {
    (role === "full" ? writeFull : writeFanout)(cwd, { solve: true });
    if (mode !== "A") {
      const env = { ...process.env, ...GIT_ID };
      run("git", ["add", "-A"], { cwd, env });
      run("git", ["commit", "-qm", `feat: ${role} reference solution`], { cwd, env });
      // The Stop hook the agent's host would run: proves the shim and the
      // fixture's speclaw install work.
      const hook = run("speclaw", ["ship-on-stop"], { cwd, env, input: "{}" });
      text = `ship-on-stop exit ${hook.code}: ${hook.stdout.trim().slice(0, 400)}`;
      const types =
        mode === "F" ? ["implementer", "implementer", "implementer"] : ["reviewer", "tester"];
      types.forEach((type, k) =>
        subagents.push({
          type,
          start: t0 + (mode === "F" ? 10 : 1000 * k),
          end: t0 + 900 + 1000 * k,
        }),
      );
    }
  } else if (role === "review") {
    const planted = (process.env.BENCH_FAKE_DEFECTS || "").split(",").filter(Boolean);
    const finding = {
      stub: "- **design.md is a stub**: the Approach section is still the scaffold placeholder, yet the task list is checked.",
      "real-data":
        "- **Test touches real data**: test/balance.test.js writes data/ledger.json in the checkout instead of a temp copy.",
      "missing-report":
        "- **Missing discipline report**: reports/ holds only README.md; no backend.md.",
      "red-first":
        "- **No red-first evidence**: nothing shows the regression test failing before the fix.",
    };
    const body = planted.length
      ? `# Review — ${REVIEW_CHANGE}\n\nVerdict: FAIL\n\n## Findings\n\n${planted.map((d) => finding[d]).join("\n")}\n`
      : `# Review — ${REVIEW_CHANGE}\n\nVerdict: PASS\n\nThe fix, its regression test and the report match the bugfix record.\n`;
    const file = path.join(cwd, "lawbook", "changes", REVIEW_CHANGE, "reports", "review.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    text = body.split("\n")[2];
  }
  const dir = path.join(process.env.BENCH_FAKE_TRANSCRIPTS, "fake-project");
  fs.mkdirSync(path.join(dir, session, "subagents"), { recursive: true });
  const usage = {
    input_tokens: 1200,
    cache_read_input_tokens: 30000,
    cache_creation_input_tokens: 4000,
    output_tokens: 800,
  };
  const at = (ms) => new Date(ms).toISOString();
  const lines = [
    {
      type: "user",
      timestamp: at(t0),
      message: { role: "user", content: process.env.BENCH_PROMPT },
    },
    {
      type: "assistant",
      timestamp: at(t0 + 5),
      message: {
        usage,
        content: [
          { type: "tool_use", id: `${session}-1`, name: "mcp__speclaw__compass_find", input: {} },
          ...subagents.map((s, k) => ({
            type: "tool_use",
            id: `${session}-a${k}`,
            name: "Agent",
            input: { subagent_type: s.type },
          })),
        ],
      },
    },
  ];
  fs.writeFileSync(
    path.join(dir, `${session}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
  subagents.forEach((s, k) => {
    const sub = [
      { type: "user", timestamp: at(s.start), message: { role: "user", content: "part" } },
      {
        type: "assistant",
        timestamp: at(s.end),
        message: {
          usage: { ...usage, cache_read_input_tokens: 20000 },
          content: [{ type: "tool_use", id: `${session}-s${k}`, name: "Write", input: {} }],
        },
      },
    ];
    fs.writeFileSync(
      path.join(dir, session, "subagents", `agent-${k}.jsonl`),
      sub.map((l) => JSON.stringify(l)).join("\n") + "\n",
    );
    fs.writeFileSync(
      path.join(dir, session, "subagents", `agent-${k}.meta.json`),
      JSON.stringify({ agentType: s.type }),
    );
  });
  console.log(
    JSON.stringify({
      type: "result",
      subtype: "success",
      duration_ms: Date.now() - t0,
      num_turns: 2,
      total_cost_usd: 0,
      usage,
      session_id: session,
      result: text,
    }),
  );
}

// ---------------------------------------------------------------- dry-run checks

/**
 * Dry-run only: the fixtures and detectors behave — the unsolved task fails
 * its hidden tests, the reference passes them, the review fixture's code
 * passes with or without plants, and a clean review names no defect. Returns
 * the list of failures.
 */
function selfCheck(bench, results, opts) {
  const fail = [];
  for (const [label, write, files] of [
    ["full", writeFull, FULL_ACCEPTANCE],
    ["fanout", writeFanout, FANOUT_ACCEPTANCE],
  ]) {
    const dir = fs.mkdtempSync(path.join(bench.root, `selfcheck-${label}-`));
    write(dir);
    const before = acceptance(dir, files);
    if (before.pass === before.total)
      fail.push(`${label}: hidden acceptance passes before any work`);
    if (!npmTest(dir)) fail.push(`${label}: the starting repo's own tests fail`);
  }
  // The planted defects are process defects: the code passes either way, and
  // only the planted test writes the fixture's data file.
  for (const defects of [[], ["real-data"]]) {
    const dir = makeReviewFixture(bench, `selfcheck-review-${defects.length}`, defects);
    const ledger = path.join(dir, "data", "ledger.json");
    const data = fs.readFileSync(ledger, "utf8");
    if (!npmTest(dir)) fail.push(`review fixture [${defects}]: npm test fails`);
    if ((fs.readFileSync(ledger, "utf8") !== data) !== defects.includes("real-data"))
      fail.push(`review fixture [${defects}]: data/ledger.json write does not match the plant`);
  }
  const clean = detectDefects(
    "Verdict: PASS\n\nThe fix, its regression test (red before the fix, shown in reports/backend.md) and design.md all match.",
    Object.keys(DEFECTS).filter((d) => d !== "red-first"),
  );
  for (const [d, hit] of Object.entries(clean))
    if (hit) fail.push(`detector ${d} fires on a clean review: ${hit}`);
  for (const [key, list] of Object.entries(results.runs)) {
    for (const r of list) {
      if (r.transcript === null) fail.push(`${key}: transcript not parsed`);
      if (key.startsWith("full") || key.startsWith("fanout")) {
        if (!r.tests) fail.push(`${key}: npm test failed on the reference solution`);
        if (r.acceptance.pass !== r.acceptance.total || !r.acceptance.total)
          fail.push(
            `${key}: hidden acceptance ${r.acceptance.pass}/${r.acceptance.total} on the reference solution`,
          );
      }
      if (key === "review" && opts.defects.some((d) => !r.caught[d]))
        fail.push(`review: fake findings not detected`);
    }
  }
  return fail;
}

// ---------------------------------------------------------------- main

function main() {
  if (process.argv[2] === "--fake-agent") return fakeAgent();
  const opts = parseArgs(process.argv.slice(2));
  const bench = makeBench(opts);
  fs.mkdirSync(path.join(bench.root, "raw"));
  const version = JSON.parse(
    fs.readFileSync(path.join(opts.speclawDist, "..", "package.json"), "utf8"),
  ).version;
  const results = {
    meta: {
      date: new Date().toISOString(),
      dryRun: opts.dryRun,
      agent: opts.dryRun ? "fake (dry run)" : `${bench.agent.cmd} … ${bench.agent.args}`,
      speclawDist: opts.speclawDist,
      speclawVersion: version,
      defects: opts.defects,
      out: bench.root,
    },
    runs: {},
    summary: {},
  };
  const push = (key, r) => (results.runs[key] ??= []).push(r);
  const log = (msg) => process.stderr.write(`[cortex-flow] ${msg}\n`);
  try {
    for (let i = 1; i <= opts.runs; i++) {
      if (opts.scenario === "full" || opts.scenario === "all") {
        for (const mode of ["A", "B"]) {
          log(`full ${mode} run ${i}/${opts.runs}`);
          push(`full-${mode}`, runTask(bench, opts, "full", mode, i));
        }
      }
      if (opts.scenario !== "fanout") {
        log(`review probe run ${i}/${opts.runs}`);
        push("review", runReview(bench, opts, i, opts.defects, "review"));
        if (opts.control) {
          log(`review control run ${i}/${opts.runs}`);
          push("control", runReview(bench, opts, i, [], "control"));
        }
      }
      if (opts.scenario === "fanout" || opts.scenario === "all") {
        for (const mode of ["A", "F"]) {
          log(`fanout ${mode} run ${i}/${opts.runs}`);
          push(`fanout-${mode}`, runTask(bench, opts, "fanout", mode, i));
        }
      }
    }
    for (const [key, list] of Object.entries(results.runs)) {
      const [scenario, mode] = key.split("-");
      if (mode) (results.summary[scenario] ??= {})[mode] = summarize(list);
    }
    results.bar = bar(results, opts);
    if (opts.dryRun) results.selfCheck = selfCheck(bench, results, opts);
  } finally {
    if (!opts.keep) {
      for (const n of fs.readdirSync(bench.root)) {
        if (!["raw", "transcripts", "results.json", "summary.md"].includes(n)) {
          fs.rmSync(path.join(bench.root, n), { recursive: true, force: true });
        }
      }
    }
  }
  const md = markdown(results, opts);
  const json = JSON.stringify(results, null, 2) + "\n";
  fs.writeFileSync(path.join(bench.root, "results.json"), json);
  fs.writeFileSync(path.join(bench.root, "summary.md"), md);
  if (opts.json) fs.writeFileSync(opts.json, json);
  if (opts.md) fs.writeFileSync(opts.md, md);
  console.log(md);
  if (opts.dryRun) {
    if (results.selfCheck.length) {
      console.log(`Dry-run self-check FAILED:\n- ${results.selfCheck.join("\n- ")}`);
      process.exitCode = 1;
    } else
      console.log(
        "Dry-run self-check passed: fixtures, speclaw setup, grading and parsing work end to end.",
      );
  }
}

main();
