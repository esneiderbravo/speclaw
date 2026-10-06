// Covers: req~compass-call-log~1
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import {
  CALL_LOG_ROTATE_BYTES,
  COMPASS_CALL_LOG,
  NUDGE_ENTRY,
  countEvidence,
  isEvidenceTool,
  readCompassCalls,
  recordCompassCall,
  rotateCallLog,
} from "../../src/shared/compass-calls.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { captureTools } from "../helpers/contracts.js";
import { registerCompass } from "../../src/modules/compass/register.js";
import { runCli, cliBuilt } from "../helpers/cli.js";

const logRel = path.join(".speclaw", COMPASS_CALL_LOG);

test("recordCompassCall appends {at, tool} lines that readCompassCalls returns", (t) => {
  const root = tmpRepo(t);
  recordCompassCall(root, "compass_explore");
  recordCompassCall(root, "compass_find");
  const calls = readCompassCalls(root);
  assert.deepEqual(
    calls.map((c) => c.tool),
    ["compass_explore", "compass_find"],
  );
  for (const c of calls) assert.ok(!Number.isNaN(Date.parse(c.at)));
  const raw = fs.readFileSync(path.join(root, logRel), "utf8");
  assert.equal(raw.trim().split("\n").length, 2);
});

test("readCompassCalls returns [] when the log is missing", (t) => {
  assert.deepEqual(readCompassCalls(tmpRepo(t)), []);
});

test("a malformed line is skipped", (t) => {
  const root = tmpRepo(t);
  const at = new Date().toISOString();
  write(
    root,
    logRel,
    [
      JSON.stringify({ at, tool: "compass_find" }),
      "{not json",
      JSON.stringify({ at: "not a date", tool: "compass_find" }),
      JSON.stringify({ tool: "compass_find" }),
      "42",
      JSON.stringify({ at, tool: "compass_explore" }),
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    readCompassCalls(root).map((c) => c.tool),
    ["compass_find", "compass_explore"],
  );
});

test("a partial first line in the bounded tail is dropped", (t) => {
  const root = tmpRepo(t);
  const line = JSON.stringify({ at: new Date().toISOString(), tool: "compass_explore" }) + "\n";
  write(root, logRel, line.repeat(10));
  // A tail one byte short of two lines starts mid-line: only one full line survives.
  const calls = readCompassCalls(root, { maxBytes: line.length * 2 - 1 });
  assert.equal(calls.length, 1);
  // A tail that lands exactly on a line boundary keeps its whole first line.
  assert.equal(readCompassCalls(root, { maxBytes: line.length * 3 }).length, 3);
  // A tail bigger than the file reads from offset 0 and keeps every line.
  assert.equal(readCompassCalls(root, { maxBytes: line.length * 100 }).length, 10);
});

test("the log rotates to .jsonl.1 once it exceeds the size cap", (t) => {
  const root = tmpRepo(t);
  const file = path.join(root, logRel);
  write(root, logRel, "x".repeat(CALL_LOG_ROTATE_BYTES + 1));
  write(root, logRel + ".1", "old generation\n");
  recordCompassCall(root, "compass_find");
  assert.equal(fs.readFileSync(`${file}.1`, "utf8").length, CALL_LOG_ROTATE_BYTES + 1);
  const live = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(live.length, 1);
  assert.equal(JSON.parse(live[0]!).tool, "compass_find");
});

test("a log at exactly the cap does not rotate", (t) => {
  const root = tmpRepo(t);
  write(root, logRel, "x".repeat(CALL_LOG_ROTATE_BYTES - 1) + "\n");
  recordCompassCall(root, "compass_find");
  assert.equal(fs.existsSync(path.join(root, logRel + ".1")), false);
});

test("sinceMs keeps only entries at or after the instant", (t) => {
  const root = tmpRepo(t);
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  recordCompassCall(root, "compass_find", new Date(base - 1000));
  recordCompassCall(root, "compass_explore", new Date(base));
  recordCompassCall(root, "compass_trace", new Date(base + 1000));
  assert.deepEqual(
    readCompassCalls(root, { sinceMs: base }).map((c) => c.tool),
    ["compass_explore", "compass_trace"],
  );
});

test("compass_index and nudge entries are not evidence", (t) => {
  const root = tmpRepo(t);
  recordCompassCall(root, "compass_index");
  recordCompassCall(root, NUDGE_ENTRY);
  assert.equal(countEvidence(readCompassCalls(root)), 0);
  assert.equal(isEvidenceTool("compass_index"), false);
  assert.equal(isEvidenceTool(NUDGE_ENTRY), false);
  for (const tool of [
    "compass_explore",
    "compass_find",
    "compass_diff_context",
    "compass_impact",
    "compass_trace",
    "compass_search",
    "compass_recall",
  ]) {
    assert.equal(isEvidenceTool(tool), true, tool);
  }
  recordCompassCall(root, "compass_diff_context");
  assert.equal(countEvidence(readCompassCalls(root)), 1);
});

test("a write failure never throws", (t) => {
  const root = tmpRepo(t);
  // `.speclaw` is a regular file, so neither mkdir nor append can succeed.
  write(root, ".speclaw", "not a directory");
  assert.doesNotThrow(() => recordCompassCall(root, "compass_explore"));
  assert.deepEqual(readCompassCalls(root), []);
});

test("MCP compass_explore, compass_index, and an alias each record their tool name", async (t) => {
  const root = tmpRepo(t);
  const tools = captureTools(registerCompass);
  // No index exists: the handlers may fail, but the call is logged first.
  for (const [name, args] of [
    ["compass_explore", { projectPath: root, node: "alpha" }],
    ["compass_index", { projectPath: root, action: "status" }],
    ["compass_search", { projectPath: root, query: "alpha" }],
  ] as const) {
    try {
      await tools.get(name)!.handler(args);
    } catch {
      /* missing index is fine here */
    }
  }
  const calls = readCompassCalls(root);
  assert.deepEqual(
    calls.map((c) => c.tool),
    ["compass_explore", "compass_index", "compass_search"],
  );
  for (const c of calls) assert.match(c.at, /^\d{4}-\d{2}-\d{2}T/);
});

test(
  "CLI explore and index record their MCP tool names",
  { skip: cliBuilt() ? false : "dist/ not built — run `npm run build` first" },
  (t) => {
    const root = tmpRepo(t);
    write(root, "src/a.ts", "export function alpha() { return 1; }\n");
    assert.equal(runCli(["index"], { cwd: root }).code, 0);
    runCli(["explore", "alpha"], { cwd: root });
    runCli(["diff-context", "--file", "src/a.ts"], { cwd: root });
    assert.deepEqual(
      readCompassCalls(root).map((c) => c.tool),
      ["compass_index", "compass_explore", "compass_diff_context"],
    );
  },
);

const line = (tool: string, ms: number) => JSON.stringify({ at: new Date(ms).toISOString(), tool });

test("evidence rotated into .1 still counts when the live log does not reach back to sinceMs", (t) => {
  const root = tmpRepo(t);
  const T = Date.parse("2026-04-01T00:00:00.000Z");
  write(
    root,
    logRel + ".1",
    [line("compass_find", T - 5000), line("compass_find", T + 5000)].join("\n") + "\n",
  );
  write(root, logRel, line("compass_index", T + 10_000) + "\n");
  assert.deepEqual(
    readCompassCalls(root, { sinceMs: T }).map((c) => c.tool),
    ["compass_find", "compass_index"],
  );
  assert.equal(countEvidence(readCompassCalls(root, { sinceMs: T })), 1);
  // with no sinceMs, both generations are read
  assert.equal(readCompassCalls(root).length, 3);
});

test(".1 is not read when the live log already reaches back to sinceMs, or was only partly read", (t) => {
  const root = tmpRepo(t);
  const T = Date.parse("2026-04-01T00:00:00.000Z");
  write(root, logRel + ".1", line("compass_find", T + 1) + "\n");
  write(
    root,
    logRel,
    [line("compass_index", T - 1), line("compass_index", T + 2)].join("\n") + "\n",
  );
  assert.equal(countEvidence(readCompassCalls(root, { sinceMs: T })), 0);

  // live bigger than the window: the read stays bounded to the live tail
  const big = line("compass_index", T + 3) + "\n";
  write(root, logRel, big.repeat(50));
  assert.equal(countEvidence(readCompassCalls(root, { sinceMs: T, maxBytes: big.length * 4 })), 0);
});

test("rotateCallLog tolerates a missing log and never demotes a fresh file to .1", (t) => {
  const root = tmpRepo(t);
  const file = path.join(root, logRel);
  assert.doesNotThrow(() => rotateCallLog(file));
  // Simulates losing the race: the file claimed is a fresh, under-cap live log.
  write(root, logRel + ".1", "previous generation\n");
  write(root, logRel, line("compass_find", Date.now()) + "\n");
  rotateCallLog(file);
  assert.equal(fs.readFileSync(`${file}.1`, "utf8"), "previous generation\n");
  assert.deepEqual(
    readCompassCalls(root, { sinceMs: 0 }).map((c) => c.tool),
    ["compass_find"],
  );
  assert.deepEqual(
    fs.readdirSync(path.join(root, ".speclaw")).filter((f) => f.endsWith(".tmp")),
    [],
  );
});

test("concurrent writers rotate without a short .1 generation or leftover temp files", (t) => {
  const root = tmpRepo(t);
  const mod = pathToFileURL(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "src",
      "shared",
      "compass-calls.js",
    ),
  ).href;
  const script = `
    const { recordCompassCall } = await import(${JSON.stringify(mod)});
    for (let i = 0; i < 2500; i++) recordCompassCall(${JSON.stringify(root)}, "compass_find");`;
  // A parent process starts four writers at once and waits for all of them.
  const parent = `
    const { spawn } = await import("node:child_process");
    const kids = Array.from({ length: 4 }, () =>
      spawn(process.execPath, ["--input-type=module", "-e", ${JSON.stringify(script)}], { stdio: "inherit" }));
    const codes = await Promise.all(kids.map((k) => new Promise((r) => k.on("exit", r))));
    if (codes.some((c) => c !== 0)) process.exit(1);`;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", parent], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr);
  const dir = path.join(root, ".speclaw");
  const one = path.join(dir, COMPASS_CALL_LOG + ".1");
  assert.ok(fs.existsSync(one), "at least one rotation happened");
  assert.ok(fs.statSync(one).size > CALL_LOG_ROTATE_BYTES, ".1 is a full generation");
  assert.deepEqual(
    fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")),
    [],
  );
  for (const l of fs.readFileSync(path.join(dir, COMPASS_CALL_LOG), "utf8").trim().split("\n")) {
    assert.equal(JSON.parse(l).tool, "compass_find");
  }
});
