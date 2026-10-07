import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Readable } from "node:stream";
import { tmpRepo, write, has } from "../helpers/env.js";
import { CLI } from "../helpers/cli.js";
import {
  hookTarget,
  reindexPathArgs,
  runReindexFile,
} from "../../src/cli/commands/reindex-file.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { explore } from "../../src/modules/compass/query.js";
import { realPathOf } from "../../src/shared/paths.js";

// Covers: req~reindex-on-edit~1
test("reindexPathArgs keeps paths, drops flags, and honors --", () => {
  assert.deepEqual(reindexPathArgs([]), []);
  assert.deepEqual(reindexPathArgs(["a.ts", "--quiet", "b.ts"]), ["a.ts", "b.ts"]);
  assert.deepEqual(reindexPathArgs(["--", "-odd.ts", "--", "c.ts"]), ["-odd.ts", "--", "c.ts"]);
});

// Covers: req~reindex-on-edit~1
test("hookTarget takes file_path, then notebook_path, resolved against the payload cwd", () => {
  const base = path.resolve("/work/proj");
  assert.equal(
    hookTarget({ tool_input: { file_path: " /abs/a.ts " } }, base),
    path.resolve("/abs/a.ts"),
  );
  assert.equal(
    hookTarget({ tool_input: { file_path: "", notebook_path: "n.ipynb" }, cwd: "/other" }, base),
    path.resolve("/other", "n.ipynb"),
  );
  // a relative payload cwd is ignored in favor of the fallback
  assert.equal(
    hookTarget({ tool_input: { file_path: "src/a.ts" }, cwd: "rel" }, base),
    path.join(base, "src/a.ts"),
  );
  assert.equal(hookTarget({ tool_input: { file_path: 3 } }, base), null);
  assert.equal(hookTarget({ tool_input: {} }, base), null);
  assert.equal(hookTarget({}, base), null);
  assert.equal(hookTarget(null, base), null);
  assert.equal(hookTarget("x", base), null);
});

test("realPathOf resolves the existing prefix of a deleted path", (t) => {
  const root = tmpRepo(t);
  const gone = path.join(root, "missing", "deep", "f.ts");
  assert.equal(realPathOf(gone), path.join(realPathOf(root), "missing", "deep", "f.ts"));
});

// Covers: req~reindex-on-edit~1
test("runReindexFile path mode re-indexes in process and never throws", async (t) => {
  const bare = tmpRepo(t);
  write(bare, "a.ts", "export function a(): void {}\n");
  await runReindexFile(["a.ts"], bare);
  assert.equal(has(bare, ".speclaw"), false);

  const root = tmpRepo(t);
  write(root, "a.ts", "export function a(): number {\n  return 1;\n}\n");
  await buildIndex(root);
  write(root, "a.ts", "export function a(): number {\n  return 31337;\n}\n");
  await runReindexFile(["--", "a.ts"], root);
  assert.match(explore(root, "a").symbol!.source, /31337/);
});

/** A payload stream for hook mode, optionally flagged as a terminal. */
const stdinOf = (text: string, isTTY = false): Readable & { isTTY?: boolean } =>
  Object.assign(Readable.from([Buffer.from(text)]), { isTTY });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Covers: req~reindex-on-edit~1
test("runReindexFile hook mode spawns the detached child and returns", async (t) => {
  const root = tmpRepo(t);
  write(root, "a.ts", "export function a(): number {\n  return 1;\n}\n");
  await buildIndex(root);
  write(root, "a.ts", "export function a(): number {\n  return 777;\n}\n");
  const payload = JSON.stringify({ tool_input: { file_path: "a.ts" }, cwd: root });
  await runReindexFile([], root, { entry: CLI, stdin: stdinOf(payload) });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && !/777/.test(explore(root, "a").symbol?.source ?? "")) {
    await sleep(100);
  }
  assert.match(explore(root, "a").symbol!.source, /777/);
});

// Covers: req~reindex-on-edit~1
test("runReindexFile hook mode ignores bad payloads, outside targets, and a terminal", async (t) => {
  const root = tmpRepo(t);
  write(root, "a.ts", "export function a(): void {}\n");
  await buildIndex(root);
  const outside = tmpRepo(t);
  const stray = path.join(root, "never-spawned");
  // an entry that would leave evidence if a child were (wrongly) spawned
  const entry = write(
    root,
    "spy.mjs",
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(stray)}, "x");\n`,
  );
  for (const text of [
    "{not json",
    JSON.stringify({ tool_input: {} }),
    JSON.stringify({ tool_input: { file_path: path.join(outside, "x.ts") } }),
    "x".repeat(1024 * 1024 + 1),
  ]) {
    await runReindexFile([], root, { entry, stdin: stdinOf(text) });
  }
  // no index: nothing spawned either
  const bare = tmpRepo(t);
  await runReindexFile([], bare, {
    entry,
    stdin: stdinOf(JSON.stringify({ tool_input: { file_path: "a.ts" } })),
  });
  await sleep(300);
  assert.equal(has(root, "never-spawned"), false);

  // a terminal prints usage instead of blocking on stdin
  const out: string[] = [];
  const write0 = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => (
    out.push(String(chunk)),
    true
  )) as typeof process.stdout.write;
  try {
    await runReindexFile([], root, { entry, stdin: stdinOf("", true) });
  } finally {
    process.stdout.write = write0;
  }
  assert.match(out.join(""), /^Usage: speclaw reindex-file/);
});
