import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { runCli, cliBuilt, CLI } from "../helpers/cli.js";
import { openDb } from "../../src/modules/compass/db.js";
import { MAP_START, MAP_END } from "../../src/modules/compass/map.js";

// `speclaw reindex-file` drives the built CLI in temp projects only: it must be
// silent, always exit 0, never create an index, and (in hook mode) return
// before the detached re-index runs.

const skip = cliBuilt() ? false : "dist/ not built — run `npm run build` first";

const MAP_DOC = `# Compass\n\n${MAP_START}\n${MAP_END}\n`;
const EDITED = "export function helper(): number {\n  return 4242;\n}\n";

function indexedProject(t: Parameters<typeof tmpRepo>[0]): string {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  write(root, "docs/compass.md", MAP_DOC);
  const r = runCli(["index"], { cwd: root });
  assert.equal(r.code, 0, r.stderr);
  return root;
}

const payload = (filePath: string, cwd?: string): string =>
  JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: { file_path: filePath, old_string: "a", new_string: "b" },
    ...(cwd ? { cwd } : {}),
  });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const helperSource = (root: string): string => {
  const r = runCli(["explore", "helper"], { cwd: root });
  return r.stdout;
};

/** Poll until `helper`'s indexed source matches, or the deadline passes. */
async function waitForHelper(root: string, re: RegExp, ms = 10_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (re.test(helperSource(root))) return true;
    await sleep(200);
  }
  return false;
}

const tables = (root: string): unknown => {
  const db = openDb(root);
  try {
    return ["files", "nodes", "edges"].map((t) =>
      db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(),
    );
  } finally {
    db.close();
  }
};

// Covers: req~reindex-on-edit~1
test("reindex-file without an index is silent and creates nothing", { skip }, (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  const path1 = runCli(["reindex-file", "src/util.ts"], { cwd: root });
  const hook = runCli(["reindex-file"], {
    cwd: root,
    input: payload(path.join(root, "src/util.ts")),
  });
  for (const r of [path1, hook]) {
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  }
  assert.equal(has(root, ".speclaw"), false);
});

// Covers: req~reindex-on-edit~1
test("reindex-file path mode picks up an edit and a new function silently", { skip }, (t) => {
  const root = indexedProject(t);
  const mapFile = path.join(root, "docs", "compass.md");
  const mapBytes = read(root, "docs/compass.md");
  const mapMtime = statSync(mapFile).mtimeMs;
  write(root, "src/util.ts", EDITED + "export function brandNew(): number {\n  return 1;\n}\n");
  const r = runCli(["reindex-file", "--", "src/util.ts"], {
    cwd: root,
    env: { FORCE_COLOR: "1", NO_COLOR: undefined, SPECLAW_NO_UPDATE_NOTIFIER: undefined },
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "");
  assert.match(helperSource(root), /return 4242/);
  const fresh = runCli(["explore", "brandNew"], { cwd: root });
  assert.match(fresh.stdout, /brandNew/);
  assert.doesNotMatch(fresh.stdout, /not found/i);
  // the compact map is left to the next full run
  assert.equal(read(root, "docs/compass.md"), mapBytes);
  assert.equal(statSync(mapFile).mtimeMs, mapMtime);
});

// Covers: req~reindex-on-edit~1
test(
  "reindex-file hook mode re-indexes the payload's file in the background",
  { skip },
  async (t) => {
    const root = indexedProject(t);
    write(root, "src/util.ts", EDITED);
    const r = runCli(["reindex-file"], {
      cwd: root,
      input: payload(path.join(root, "src/util.ts")),
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
    assert.ok(await waitForHelper(root, /return 4242/), "edit picked up within 10 s");

    // a relative file_path resolves against the payload cwd
    write(root, "src/util.ts", EDITED.replace("4242", "5151"));
    const rel = runCli(["reindex-file"], { cwd: root, input: payload("src/util.ts", root) });
    assert.equal(rel.code, 0);
    assert.ok(await waitForHelper(root, /return 5151/), "relative path picked up");
  },
);

// Covers: req~reindex-on-edit~1
test("reindex-file hook mode does not wait for a locked index", { skip }, async (t) => {
  const root = indexedProject(t);
  write(root, "src/util.ts", EDITED);
  const holder = openDb(root);
  holder.exec("BEGIN IMMEDIATE");
  let elapsed: number;
  try {
    const start = Date.now();
    const r = runCli(["reindex-file"], {
      cwd: root,
      input: payload(path.join(root, "src/util.ts")),
    });
    elapsed = Date.now() - start;
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  } finally {
    holder.exec("ROLLBACK");
    holder.close();
  }
  assert.ok(elapsed < 2000, `hook returned in ${elapsed} ms`);
  // the detached child finishes on its own once the lock is gone
  assert.ok(await waitForHelper(root, /return 4242/), "detached child completed");
});

// Covers: req~reindex-on-edit~1
test("reindex-file path mode swallows a locked database", { skip }, (t) => {
  const root = indexedProject(t);
  write(root, "src/util.ts", EDITED);
  const holder = openDb(root);
  holder.exec("BEGIN IMMEDIATE");
  try {
    // spawnSync blocks this process, so the lock outlives the busy timeout
    const r = runCli(["reindex-file", "src/util.ts"], { cwd: root });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  } finally {
    holder.exec("ROLLBACK");
    holder.close();
  }
});

// Covers: req~reindex-on-edit~1
test("the last edit wins when a run waits for the lock", { skip }, async (t) => {
  const root = indexedProject(t);
  write(root, "src/util.ts", EDITED.replace("4242", "1111"));
  const holder = openDb(root);
  holder.exec("BEGIN IMMEDIATE");
  const child = spawn(process.execPath, [CLI, "reindex-file", "src/util.ts"], {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, SPECLAW_NO_UPDATE_NOTIFIER: "1" },
  });
  const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
  try {
    await sleep(1000); // the child is now blocked on the write lock
    write(root, "src/util.ts", EDITED.replace("4242", "2222"));
  } finally {
    holder.exec("ROLLBACK");
    holder.close();
  }
  assert.equal(await exited, 0);
  assert.match(helperSource(root), /return 2222/);
});

// Covers: req~reindex-on-edit~1
test("reindex-file ignores ineligible targets and malformed payloads", { skip }, (t) => {
  const root = indexedProject(t);
  const outside = tmpRepo(t);
  write(outside, "x.ts", "export function x(): void {}\n");
  write(root, "node_modules/x.ts", "export function nm(): void {}\n");
  write(root, "README.md", "# readme\n");
  const before = tables(root);
  const runs = [
    runCli(["reindex-file", path.join(outside, "x.ts"), "node_modules/x.ts", "README.md"], {
      cwd: root,
    }),
    runCli(["reindex-file"], { cwd: root, input: "{not json" }),
    runCli(["reindex-file"], { cwd: root, input: JSON.stringify({ tool_input: {} }) }),
    runCli(["reindex-file"], { cwd: root, input: payload(path.join(outside, "x.ts")) }),
  ];
  for (const r of runs) {
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  }
  assert.deepEqual(tables(root), before);
});

// Covers: req~reindex-on-edit~1
test("reindex-file is not logged as a Compass call", { skip }, (t) => {
  const root = indexedProject(t);
  const log = path.join(".speclaw", "compass-calls.jsonl");
  write(root, log, '{"tool":"compass_explore","ts":"2026-01-01T00:00:00.000Z"}\n');
  const before = read(root, log);
  write(root, "src/util.ts", EDITED);
  const r = runCli(["reindex-file", "src/util.ts"], { cwd: root });
  assert.equal(r.code, 0);
  assert.equal(read(root, log), before);
});

// Covers: req~reindex-on-edit~1
test("help lists reindex-file and its --help prints usage", { skip }, (t) => {
  const root = tmpRepo(t);
  const top = runCli(["help"], { cwd: root });
  assert.match(top.stdout, /^\s+reindex-file\s/m);
  const own = runCli(["reindex-file", "--help"], { cwd: root });
  assert.equal(own.code, 0);
  assert.match(own.stdout, /^Usage: speclaw reindex-file/);
  assert.equal(has(root, ".speclaw"), false, "help never indexes");
});
