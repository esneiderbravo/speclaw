import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, read, has } from "../helpers/env.js";
import { checkAction, clearLawCache } from "../../src/modules/foundation/check.js";
import { writeLawManifest, type Law } from "../../src/modules/foundation/laws.js";
import { compassNudge } from "../../src/modules/foundation/compass-nudge.js";
import {
  COMPASS_CALL_LOG,
  readCompassCalls,
  recordCompassCall,
} from "../../src/shared/compass-calls.js";
import { runCli, cliBuilt } from "../helpers/cli.js";
import { captureTools } from "../helpers/contracts.js";
import { registerFoundation } from "../../src/modules/foundation/register.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const lawOf = (over: Partial<Law> = {}): Law => ({
  id: "law~x~1",
  title: "X",
  severity: "warn",
  scope: [],
  prose: "do x",
  verification: { kind: "path" },
  enforcement: "feedback",
  source: { file: "LAWS.md" },
  ...over,
});

function project(t: Parameters<typeof tmpRepo>[0], laws: Law[]): string {
  const root = tmpRepo(t);
  clearLawCache();
  writeLawManifest(root, { version: 1, laws });
  return root;
}

test("a blocking law denies a matching PreToolUse and cites id + prose + source", (t) => {
  const root = project(t, [
    lawOf({
      id: "law~no-secrets~1",
      scope: ["**/.env"],
      enforcement: "bloqueo",
      prose: "Never write .env",
      source: { file: "docs/standards/base-standards.md", line: 42 },
    }),
  ]);
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "deny");
  assert.match(r.reason ?? "", /law~no-secrets~1/);
  assert.match(r.reason ?? "", /Never write \.env/);
  assert.match(r.reason ?? "", /base-standards\.md:42/);
  assert.ok(typeof r.elapsedMs === "number");
});

test("an out-of-scope law is not evaluated", (t) => {
  const root = project(t, [lawOf({ id: "law~fe~1", scope: ["src/frontend/**"] })]);
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: "src/backend/api.ts" } },
  });
  assert.equal(r.evaluated.length, 0);
  assert.equal(r.verdict, "allow");
});

test("a feedback law allows but returns its message on PostToolUse", (t) => {
  const root = project(t, [
    lawOf({ id: "law~pkg~1", scope: ["package.json"], enforcement: "feedback" }),
  ]);
  const r = checkAction({
    projectPath: root,
    event: "PostToolUse",
    payload: { tool_input: { file_path: "package.json" } },
  });
  assert.equal(r.verdict, "allow");
  assert.match(r.reason ?? "", /law~pkg~1/);
  assert.equal(r.evaluated[0]?.passed, true);
});

test("a bloqueo law does not deny on PostToolUse (only PreToolUse blocks)", (t) => {
  const root = project(t, [lawOf({ scope: ["**/.env"], enforcement: "bloqueo" })]);
  const r = checkAction({
    projectPath: root,
    event: "PostToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "allow");
});

test("evaluator fails open when the manifest is missing", (t) => {
  const root = tmpRepo(t);
  clearLawCache();
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "allow");
  assert.match(r.diagnostic ?? "", /manifest/);
});

test("evaluator fails open when the manifest is corrupt", (t) => {
  const root = tmpRepo(t);
  clearLawCache();
  fs.mkdirSync(path.join(root, ".speclaw"), { recursive: true });
  fs.writeFileSync(path.join(root, ".speclaw", "laws-manifest.json"), "{ not json");
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(r.verdict, "allow");
  assert.ok(r.diagnostic);
});

test("InstructionsLoaded appends the file's law ids to the context log", (t) => {
  const root = project(t, [
    lawOf({ id: "law~a~1", source: { file: "LAWS.md" } }),
    lawOf({ id: "law~b~1", source: { file: "LAWS.md" } }),
    lawOf({ id: "law~c~1", source: { file: "docs/other.md" } }),
  ]);
  const r = checkAction({
    projectPath: root,
    event: "InstructionsLoaded",
    payload: { file: "LAWS.md" },
  });
  assert.equal(r.verdict, "allow");
  assert.ok(has(root, ".speclaw/context-log.jsonl"));
  const log = read(root, ".speclaw/context-log.jsonl");
  assert.match(log, /law~a~1/);
  assert.match(log, /law~b~1/);
  assert.ok(!/law~c~1/.test(log)); // declared in a different file
});

test("PreToolUse p99 stays within the 15 ms budget with 50 laws", (t) => {
  const laws = Array.from({ length: 50 }, (_, i) =>
    lawOf({ id: `law~n${i}~1`, scope: [`src/mod${i}/**/*.{ts,tsx}`, "!src/gen/**"] }),
  );
  const root = project(t, laws);
  // Warm the compiled-glob cache, then measure the hot path.
  const payload = { tool_input: { file_path: "src/mod49/deep/a.ts" } };
  checkAction({ projectPath: root, event: "PreToolUse", payload });
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    const r = checkAction({ projectPath: root, event: "PreToolUse", payload });
    samples.push(r.elapsedMs);
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.99))]!;
  assert.ok(p99 < 15, `p99 was ${p99.toFixed(2)} ms (budget 15 ms)`);
});

// --- Compass-first nudge -------------------------------------------------
// Covers: req~compass-nudge~1

const MIN = 60 * 1000;

/** A fresh project with no law manifest and an empty call log. */
function bare(t: Parameters<typeof tmpRepo>[0]): string {
  clearLawCache();
  return tmpRepo(t);
}

const post = (root: string, toolName: string, toolInput: Record<string, unknown>) =>
  checkAction({
    projectPath: root,
    event: "PostToolUse",
    toolName,
    payload: { hook_event_name: "PostToolUse", tool_name: toolName, tool_input: toolInput },
  });

test("Read on a .ts file with an empty call log nudges, even with no manifest", (t) => {
  const root = bare(t);
  const r = post(root, "Read", { file_path: "src/server.ts" });
  assert.equal(r.verdict, "allow");
  assert.ok(r.nudge);
  assert.match(r.nudge, /compass_explore server/);
  assert.match(r.nudge, /compass_find "server"/);
  assert.ok(r.reason?.includes(r.nudge));
  // the nudge is recorded for the rate limit, and is not evidence
  assert.deepEqual(
    readCompassCalls(root).map((c) => c.tool),
    ["nudge"],
  );
});

test("PostToolUse Read/Grep/Glob evaluates no law; PostToolUse Write still does", (t) => {
  const root = project(t, [lawOf({ scope: ["src/**"], enforcement: "feedback" })]);
  const file = path.join(root, "src", "server.ts");
  // An evidence call suppresses the nudge, so the read result is fully silent.
  recordCompassCall(root, "compass_explore");
  for (const [tool, input] of [
    ["Read", { file_path: file }],
    ["Grep", { path: "src", pattern: "x" }],
    ["Glob", { path: "src", pattern: "**/*.ts" }],
  ] as const) {
    const r = post(root, tool, input);
    assert.equal(r.verdict, "allow");
    assert.deepEqual(r.evaluated, [], tool);
    assert.equal(r.reason, undefined, tool);
  }
  const write = post(root, "Write", { file_path: file });
  assert.equal(write.verdict, "allow");
  assert.equal(write.evaluated.length, 1);
  assert.match(write.reason ?? "", /law~x~1/);
  assert.equal(write.nudge, undefined);
});

test("a PostToolUse Read nudge carries only the nudge text, no law message", (t) => {
  const root = project(t, [lawOf({ scope: ["src/**"], enforcement: "feedback" })]);
  const r = post(root, "Read", { file_path: "src/server.ts" });
  assert.equal(r.verdict, "allow");
  assert.deepEqual(r.evaluated, []);
  assert.ok(r.nudge);
  assert.equal(r.reason, r.nudge);
});

test("a recent Compass evidence call suppresses the nudge; an old one does not", (t) => {
  const root = bare(t);
  recordCompassCall(root, "compass_explore", new Date(Date.now() - 2 * MIN));
  assert.equal(post(root, "Read", { file_path: "src/server.ts" }).nudge, undefined);

  const stale = bare(t);
  recordCompassCall(stale, "compass_explore", new Date(Date.now() - 11 * MIN));
  recordCompassCall(stale, "compass_index", new Date(Date.now() - MIN));
  assert.ok(post(stale, "Read", { file_path: "src/server.ts" }).nudge);
});

test("nudges are rate limited to one per 5 minutes", (t) => {
  const root = bare(t);
  assert.ok(post(root, "Read", { file_path: "src/server.ts" }).nudge);
  assert.equal(post(root, "Read", { file_path: "src/server.ts" }).nudge, undefined);

  const now = Date.parse("2026-05-01T12:00:00.000Z");
  const other = bare(t);
  const args = {
    projectPath: other,
    event: "PostToolUse",
    toolName: "Read",
    payload: { tool_input: { file_path: "src/a.ts" } },
  };
  assert.ok(compassNudge(args, now));
  assert.equal(compassNudge(args, now + MIN), null);
  assert.ok(compassNudge(args, now + 6 * MIN));
});

test("Grep over a source directory nudges with the pattern", (t) => {
  const root = bare(t);
  const r = post(root, "Grep", { path: "src", pattern: "handleHarness" });
  assert.ok(r.nudge);
  assert.match(r.nudge, /compass_find "handleHarness"/);
});

test("Glob whose pattern ends in an indexed extension nudges", (t) => {
  const root = bare(t);
  assert.ok(post(root, "Glob", { path: "docs", pattern: "**/*.ts" }).nudge);
});

test("non-code, empty, root, outside, ignored, and placeholder targets do not nudge", (t) => {
  const root = bare(t);
  const cases: Array<[string, Record<string, unknown>]> = [
    ["Read", { file_path: "README.md" }],
    ["Read", { file_path: "src" }],
    ["Read", { file_path: "" }],
    ["Read", {}],
    ["Grep", { pattern: "x", glob: "*.md" }],
    ["Grep", { path: "", pattern: "x", type: "md" }],
    ["Grep", { pattern: "x", type: "rust" }],
    ["Grep", { pattern: "x", glob: "**/*.{md,json}" }],
    ["Glob", { pattern: "**/*.md" }],
    ["Glob", { path: "", pattern: "docs/*.{md,yaml}" }],
    ["Glob", {}],
    ["Glob", { path: "${tool_input.path}", pattern: "${tool_input.pattern}" }],
    ["Read", { file_path: "${tool_input.file_path}", path: "${tool_input.path}" }],
    ["Read", { file_path: "../elsewhere/a.ts" }],
    ["Read", { file_path: "node_modules/pkg/index.ts" }],
    ["Read", { file_path: "dist/cli/index.js" }],
    ["Grep", { path: ".speclaw", pattern: "x" }],
    ["Glob", { path: "README.md", pattern: "**/*.md" }],
    ["Write", { file_path: "src/server.ts" }],
  ];
  for (const [tool, input] of cases) {
    assert.equal(post(root, tool, input).nudge, undefined, `${tool} ${JSON.stringify(input)}`);
  }
  assert.deepEqual(readCompassCalls(root), []);
});

test("repo-wide Grep/Glob (no path or the project root) nudges over indexed code", (t) => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ["Grep", { pattern: "handleHarness" }, /compass_find "handleHarness"/],
    ["Grep", { path: "", pattern: "x" }, /compass_find "x"/],
    ["Grep", { path: ".", pattern: "x", glob: "*.ts" }, /compass_find "x"/],
    ["Grep", { pattern: "x", type: "python" }, /compass_find "x"/],
    ["Grep", { pattern: "x", type: "ts" }, /compass_find "x"/],
    ["Grep", { pattern: "x", glob: "src/**/*.{ts,md}" }, /compass_find "x"/],
    ["Grep", { path: "${tool_input.path}", pattern: "x", glob: "${tool_input.glob}" }, /x/],
    ["Glob", { pattern: "**/*.ts" }, /compass_explore <symbol>/],
    ["Glob", { pattern: "**/*" }, /compass_find "\*\*\/\*"/],
    ["Glob", { path: ".", pattern: "src/**" }, /compass_find/],
  ];
  for (const [tool, input, text] of cases) {
    const root = bare(t);
    const r = post(root, tool, input);
    assert.ok(r.nudge, `${tool} ${JSON.stringify(input)}`);
    assert.match(r.nudge, text);
  }
  // an absolute project-root path is the same repo-wide search
  const root = bare(t);
  assert.ok(post(root, "Grep", { path: root, pattern: "x" }).nudge);
  // and it is still rate limited
  assert.equal(post(root, "Grep", { pattern: "y" }).nudge, undefined);
});

test("PreToolUse never nudges", (t) => {
  const root = bare(t);
  const r = checkAction({
    projectPath: root,
    event: "PreToolUse",
    toolName: "Read",
    payload: { tool_input: { file_path: "src/server.ts" } },
  });
  assert.equal(r.nudge, undefined);
  assert.equal(r.verdict, "allow");
});

test("a nudge failure fails open with no nudge", (t) => {
  const root = bare(t);
  // `.speclaw` is a file: the log cannot be read or written, but nothing throws.
  fs.writeFileSync(path.join(root, ".speclaw"), "x");
  const r = post(root, "Read", { file_path: "src/server.ts" });
  assert.equal(r.verdict, "allow");
  assert.equal(
    compassNudge({ projectPath: root, event: "PostToolUse", payload: null as never }),
    null,
  );
});

test("the nudge opens no index database and loads no sqlite", (t) => {
  const root = bare(t);
  fs.mkdirSync(path.join(root, ".speclaw"), { recursive: true });
  fs.writeFileSync(path.join(root, ".speclaw", "index.db"), "not a database");
  const checkJs = pathToFileURL(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "src",
      "modules",
      "foundation",
      "check.js",
    ),
  ).href;
  const script = `
    const { checkAction } = await import(${JSON.stringify(checkJs)});
    const r = checkAction({ projectPath: ${JSON.stringify(root)}, event: "PostToolUse",
      toolName: "Read", payload: { tool_input: { file_path: "src/server.ts" } } });
    console.log(JSON.stringify({ nudge: !!r.nudge,
      sqlite: process.moduleLoadList.some((m) => /sqlite/i.test(m)) }));`;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(res.stdout.trim()), { nudge: true, sqlite: false });
  assert.equal(fs.readFileSync(path.join(root, ".speclaw", "index.db"), "utf8"), "not a database");
  assert.ok(has(root, path.join(".speclaw", COMPASS_CALL_LOG)));
});

test(
  "CLI --hook-payload on PostToolUse emits additionalContext and no permissionDecision",
  { skip: cliBuilt() ? false : "dist/ not built — run `npm run build` first" },
  (t) => {
    const root = bare(t);
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "src/server.ts" },
    });
    const first = runCli(["check", "--hook-payload", "-"], { cwd: root, input: payload });
    assert.equal(first.code, 0);
    assert.doesNotMatch(first.stdout, /permissionDecision/);
    const out = JSON.parse(first.stdout.trim()) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(out.hookSpecificOutput.additionalContext, /compass_explore/);
    assert.match(out.hookSpecificOutput.additionalContext, /compass_find/);

    // rate limited: no reason, so nothing is printed and the exit is still 0
    const second = runCli(["check", "--hook-payload", "-"], { cwd: root, input: payload });
    assert.equal(second.code, 0);
    assert.equal(second.stdout.trim(), "");
  },
);

test("MCP speclaw_check carries hookSpecificOutput.additionalContext for PostToolUse, never a decision", async (t) => {
  const root = bare(t);
  const check = captureTools(registerFoundation).get("speclaw_check")!;
  const call = async (event: string, toolName: string, file: string) => {
    const res = (await check.handler({
      projectPath: root,
      event,
      toolName,
      payload: { tool_input: { file_path: file } },
    })) as { content: Array<{ text: string }> };
    return res.content[0]!.text;
  };

  const postText = await call("PostToolUse", "Read", "src/server.ts");
  assert.doesNotMatch(postText, /permissionDecision/);
  const post = JSON.parse(postText) as {
    verdict: string;
    nudge?: string;
    hookSpecificOutput?: { hookEventName: string; additionalContext: string };
  };
  assert.equal(post.verdict, "allow");
  assert.deepEqual(post.hookSpecificOutput, {
    hookEventName: "PostToolUse",
    additionalContext: post.nudge,
  });

  // rate limited: no reason, so no hookSpecificOutput either
  const quiet = JSON.parse(await call("PostToolUse", "Read", "src/server.ts")) as object;
  assert.equal("hookSpecificOutput" in quiet, false);

  // PreToolUse results keep their shape: no hookSpecificOutput
  const pre = JSON.parse(await call("PreToolUse", "Write", "src/x.ts")) as object;
  assert.equal("hookSpecificOutput" in pre, false);
});

test("a PostToolUse feedback-law message also reaches additionalContext", (t) => {
  const root = project(t, [lawOf({ scope: ["src/**"], enforcement: "feedback" })]);
  const r = post(root, "Write", { file_path: "src/server.ts" });
  assert.equal(r.hookSpecificOutput?.hookEventName, "PostToolUse");
  assert.equal(r.hookSpecificOutput?.additionalContext, r.reason);
  const deny = project(t, [lawOf({ scope: ["**/.env"], enforcement: "bloqueo" })]);
  const pre = checkAction({
    projectPath: deny,
    event: "PreToolUse",
    toolName: "Write",
    payload: { tool_input: { file_path: ".env" } },
  });
  assert.equal(pre.verdict, "deny");
  assert.equal(pre.hookSpecificOutput, undefined);
});

test("Stop and InstructionsLoaded results never carry hookSpecificOutput, even with a reason", (t) => {
  const root = project(t, [lawOf({ id: "law~g~1", scope: ["src/**"], enforcement: "gate" })]);
  const stop = checkAction({
    projectPath: root,
    event: "Stop",
    payload: { tool_input: { file_path: "src/a.ts" } },
  });
  assert.ok(stop.reason, "the gate law matched and produced a reason");
  assert.equal(stop.hookSpecificOutput, undefined);
  const loaded = checkAction({
    projectPath: root,
    event: "InstructionsLoaded",
    payload: { file: "LAWS.md" },
  });
  assert.equal(loaded.hookSpecificOutput, undefined);
});

test(
  "CLI --hook-payload keeps the pre-change output for Stop",
  { skip: cliBuilt() ? false : "dist/ not built — run `npm run build` first" },
  (t) => {
    const root = project(t, [lawOf({ id: "law~g~1", scope: ["src/**"], enforcement: "gate" })]);
    const r = runCli(["check", "--hook-payload", "-"], {
      cwd: root,
      input: JSON.stringify({ hook_event_name: "Stop", tool_input: { file_path: "src/a.ts" } }),
    });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout.trim()) as { hookSpecificOutput: Record<string, unknown> };
    assert.equal(out.hookSpecificOutput.hookEventName, "Stop");
    assert.equal(out.hookSpecificOutput.permissionDecision, "allow");
    assert.equal("additionalContext" in out.hookSpecificOutput, false);
  },
);

test("a directory with a dot in its name is a directory, not a file extension", (t) => {
  const root = bare(t);
  fs.mkdirSync(path.join(root, "src", "v1.2"), { recursive: true });
  // Read of a directory never nudges, whatever its name.
  assert.equal(post(root, "Read", { file_path: "src/v1.2" }).nudge, undefined);
  assert.ok(post(root, "Grep", { path: "src/v1.2", pattern: "x" }).nudge);

  const glob = bare(t);
  fs.mkdirSync(path.join(glob, "src", "v1.2"), { recursive: true });
  assert.ok(post(glob, "Glob", { path: "src/v1.2", pattern: "**/*.ts" }).nudge);

  const named = bare(t);
  fs.mkdirSync(path.join(named, "docs.md"), { recursive: true });
  assert.ok(post(named, "Grep", { path: "docs.md", pattern: "x" }).nudge);

  // A path that cannot be stat'ed falls back to the extension heuristic.
  const missing = bare(t);
  assert.equal(post(missing, "Grep", { path: "notes.v1.2", pattern: "x" }).nudge, undefined);
  assert.ok(post(missing, "Grep", { path: "lib/gone", pattern: "x" }).nudge);
});
