import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpRepo, write } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { startWatch, stopWatch, watchStatus } from "../../src/modules/compass/watcher.js";

test("watchStatus reports not-watching before a watch starts", (t) => {
  const root = tmpRepo(t);
  assert.deepEqual(watchStatus(root), { watching: false, reindexes: 0, mode: null });
});

test("startWatch is idempotent and stopWatch tears the watcher down", (t) => {
  const root = tmpRepo(t);
  t.after(() => stopWatch(root));
  seedSampleRepo(root);

  const started = startWatch(root);
  assert.equal(started.watching, true);
  assert.ok(started.mode === "recursive" || started.mode === "per-directory");

  // second start returns the existing status without creating a second watcher
  assert.deepEqual(startWatch(root), watchStatus(root));

  const stopped = stopWatch(root);
  assert.equal(stopped.watching, false);
  assert.deepEqual(watchStatus(root), { watching: false, reindexes: 0, mode: null });
});

test("stopWatch is safe to call when not watching", (t) => {
  const root = tmpRepo(t);
  assert.deepEqual(stopWatch(root), { watching: false, reindexes: 0, mode: null });
});

test("a file change triggers a debounced reindex", async (t) => {
  const root = tmpRepo(t);
  t.after(() => stopWatch(root));
  seedSampleRepo(root);
  startWatch(root);

  // Recursive fs.watch (FSEvents on macOS) needs a moment to establish before it
  // delivers events, especially with a node_modules tree present — warm it up so
  // the change below is observed deterministically.
  await sleep(1000);
  write(root, "src/added.ts", "export function added(): void {}\n");

  // debounce is 400ms; poll generously (the suite runs under parallel load) for
  // the reindex to land.
  let reindexed = 0;
  for (let i = 0; i < 120 && reindexed === 0; i++) {
    await sleep(100);
    reindexed = watchStatus(root).reindexes;
  }
  assert.ok(reindexed >= 1, "watcher reindexed after the change");
});
