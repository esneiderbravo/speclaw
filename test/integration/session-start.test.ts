import { test } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { runCli, cliBuilt } from "../helpers/cli.js";
import { openDb } from "../../src/modules/compass/db.js";
import { MAP_START, MAP_END } from "../../src/modules/compass/map.js";

// `speclaw session-start` drives the built CLI in temp projects only: it must be
// silent, never fail, and never create a first index.

const skip = cliBuilt() ? false : "dist/ not built — run `npm run build` first";

const MAP_DOC = `# Compass\n\n${MAP_START}\n${MAP_END}\n`;

/** A sample project with a docs/compass.md map block, indexed through the CLI. */
function indexedProject(t: Parameters<typeof tmpRepo>[0]): string {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  write(root, "docs/compass.md", MAP_DOC);
  const r = runCli(["index"], { cwd: root });
  assert.equal(r.code, 0, r.stderr);
  return root;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Covers: req~session-start-index~1
test("session-start without an index is silent and creates nothing", { skip }, (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  const r = runCli(["session-start"], { cwd: root });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "");
  assert.equal(has(root, ".speclaw/index.db"), false);
  assert.equal(has(root, ".speclaw"), false);
});

test(
  "session-start on an unchanged index is silent and keeps docs/compass.md",
  { skip },
  async (t) => {
    const root = indexedProject(t);
    const mapFile = path.join(root, "docs", "compass.md");
    const bytes = read(root, "docs/compass.md");
    const mtime = statSync(mapFile).mtimeMs;
    await sleep(20);
    // the other flags are ignored: no JSON, no forced rebuild
    const r = runCli(["session-start", "--json", "--force"], {
      cwd: root,
      env: { FORCE_COLOR: "1", NO_COLOR: undefined },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
    assert.equal(read(root, "docs/compass.md"), bytes);
    assert.equal(statSync(mapFile).mtimeMs, mtime);
  },
);

test("session-start picks up an edited function", { skip }, (t) => {
  const root = indexedProject(t);
  write(root, "src/util.ts", "export function helper(): number {\n  return 4242;\n}\n");
  const r = runCli(["session-start"], { cwd: root });
  assert.equal(r.code, 0);
  assert.equal(r.stdout + r.stderr, "");
  const explore = runCli(["explore", "helper"], { cwd: root });
  assert.equal(explore.code, 0, explore.stderr);
  assert.match(explore.stdout, /return 4242/);
});

test("session-start swallows a locked database", { skip }, (t) => {
  const root = indexedProject(t);
  write(root, "src/util.ts", "export function helper(): number {\n  return 7;\n}\n");
  const holder = openDb(root);
  holder.exec("BEGIN IMMEDIATE");
  try {
    // spawnSync blocks this process, so the write lock is held for the whole run
    const r = runCli(["session-start"], { cwd: root });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  } finally {
    holder.exec("ROLLBACK");
    holder.close();
  }
});

test("session-start is not logged as a Compass call", { skip }, (t) => {
  const root = indexedProject(t);
  const log = path.join(".speclaw", "compass-calls.jsonl");
  write(root, log, '{"tool":"compass_explore","ts":"2026-01-01T00:00:00.000Z"}\n');
  const before = read(root, log);
  const r = runCli(["session-start"], { cwd: root });
  assert.equal(r.code, 0);
  assert.equal(read(root, log), before);
});

test("help lists session-start and index --help no longer offers a flag", { skip }, (t) => {
  const root = tmpRepo(t);
  const r = runCli(["index", "--help"], { cwd: root });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.stdout, /session-start/);
  assert.equal(has(root, ".speclaw"), false, "help never indexes");
  const top = runCli(["help"], { cwd: root });
  assert.match(top.stdout, /^\s+session-start\s/m);
});
