import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { tmpRepo } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { openDb, indexPath, SCHEMA_VERSION } from "../../src/modules/compass/db.js";
import { cachedChurn, cachedCoChanges } from "../../src/modules/compass/git-history-cache.js";

test("cachedChurn serves a repeated query from the cache at the same HEAD", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);

  const first = cachedChurn(repo);
  assert.equal(first.byPath.get("src/a.ts"), 1);

  // The row now exists; tamper with the stored payload to prove the second call
  // reads the cache rather than recomputing from git.
  const raw = new DatabaseSync(indexPath(repo));
  raw
    .prepare("UPDATE git_history_cache SET payload = ? WHERE query_key LIKE 'churn:%'")
    .run(JSON.stringify({ shallow: false, byPath: [["sentinel.ts", 42]] }));
  raw.close();

  const second = cachedChurn(repo);
  assert.equal(second.byPath.get("sentinel.ts"), 42, "second call returned the cached payload");
  assert.equal(second.byPath.has("src/a.ts"), false);
});

test("cachedChurn recomputes after a new commit moves HEAD", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);

  assert.equal(cachedChurn(repo).byPath.get("src/a.ts"), 1);

  commit(repo, "two", [{ path: "src/a.ts", content: "a\nb\n" }]);
  const after = cachedChurn(repo);
  assert.equal(after.byPath.get("src/a.ts"), 2, "cache invalidated; recomputed at the new HEAD");
});

test("cachedCoChanges caches and invalidates on HEAD move", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [
    { path: "src/a.ts", content: "a\n" },
    { path: "src/b.ts", content: "b\n" },
  ]);

  const first = cachedCoChanges(repo);
  assert.equal(first.pairs.find((p) => p.a === "src/a.ts" && p.b === "src/b.ts")?.count, 1);

  commit(repo, "two", [
    { path: "src/a.ts", content: "a\na\n" },
    { path: "src/b.ts", content: "b\nb\n" },
  ]);
  const second = cachedCoChanges(repo);
  assert.equal(
    second.pairs.find((p) => p.a === "src/a.ts" && p.b === "src/b.ts")?.count,
    2,
    "recomputed after the new commit",
  );
});

test("the git_history_cache table is dropped and rebuilt on a schema reset", (t) => {
  const repo = tmpRepo(t);
  gitInit(repo);
  commit(repo, "one", [{ path: "src/a.ts", content: "a\n" }]);
  cachedChurn(repo); // populate the cache

  const before = new DatabaseSync(indexPath(repo));
  const rows = before.prepare("SELECT COUNT(*) AS n FROM git_history_cache").get() as { n: number };
  assert.ok(rows.n >= 1, "cache has an entry");
  // Simulate an older speclaw so the next openDb resets the schema.
  before.prepare("UPDATE meta SET value = '0' WHERE key = 'schema_version'").run();
  before.close();

  const db = openDb(repo); // detects staleness, resets, recreates the table empty
  const count = db.prepare("SELECT COUNT(*) AS n FROM git_history_cache").get() as { n: number };
  assert.equal(count.n, 0, "cache table exists again and is empty after reset");
  const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(version.value, SCHEMA_VERSION);
  db.close();
});
