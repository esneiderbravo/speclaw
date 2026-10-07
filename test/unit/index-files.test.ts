import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpRepo, write, read } from "../helpers/env.js";
import {
  buildIndex,
  indexFiles,
  classifyIndexPath,
  walkWouldYield,
} from "../../src/modules/compass/indexer.js";
import { openDb } from "../../src/modules/compass/db.js";
import { explore } from "../../src/modules/compass/query.js";
import { MAP_START, MAP_END } from "../../src/modules/compass/map.js";

const EMPTY_MAP = `# Compass\n\n${MAP_START}\n${MAP_END}\n`;

/**
 * Unambiguous project: every symbol name is defined once, with cross-file calls
 * into and out of `src/core/mid.ts` and a nested directory tree.
 */
function seed(root: string): void {
  write(root, "src/core/leaf.ts", "export function leaf(): number {\n  return 1;\n}\n");
  write(
    root,
    "src/core/mid.ts",
    `import { leaf } from "./leaf.js";\nexport function mid(): number {\n  return leaf() + 1;\n}\n`,
  );
  write(
    root,
    "src/app/top.ts",
    `import { mid } from "../core/mid.js";\nexport function top(): number {\n  return mid() * 2;\n}\n`,
  );
  write(root, "lib/other.ts", "export function other(): number {\n  return 9;\n}\n");
  write(root, "docs/compass.md", EMPTY_MAP);
}

async function indexed(t: Parameters<typeof tmpRepo>[0]): Promise<string> {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);
  return root;
}

type Row = Record<string, unknown>;

function rows(root: string, sql: string): Row[] {
  const db = openDb(root);
  try {
    return (db.prepare(sql).all() as Row[]).map((r) => ({ ...r }));
  } finally {
    db.close();
  }
}

const meta = (root: string, key: string): string | undefined =>
  rows(root, `SELECT value FROM meta WHERE key = '${key}'`)[0]?.value as string | undefined;

const graph = (root: string): { files: Row[]; nodes: Row[]; edges: Row[] } => ({
  files: rows(root, "SELECT id, path, hash FROM files ORDER BY id"),
  nodes: rows(root, "SELECT * FROM nodes ORDER BY id"),
  edges: rows(root, "SELECT * FROM edges ORDER BY id"),
});

const dirHashes = (root: string): Row[] =>
  rows(root, "SELECT path, hash, n_files FROM dir_hashes ORDER BY path");

/** Resolved edges by name, independent of row ids. */
const resolved = (root: string): string[] =>
  rows(
    root,
    `SELECT sf.path AS sf, s.name AS sn, df.path AS df, d.name AS dn, e.kind AS k
     FROM edges e
     JOIN nodes s ON s.id = e.src_node_id JOIN files sf ON sf.id = s.file_id
     JOIN nodes d ON d.id = e.dst_node_id JOIN files df ON df.id = d.file_id`,
  )
    .map((r) => `${r.sf}:${r.sn} -${r.k}-> ${r.df}:${r.dn}`)
    .sort();

/** A fresh full index of a copy of the project's tree (without its index). */
async function freshCopy(t: Parameters<typeof tmpRepo>[0], root: string): Promise<string> {
  const copy = tmpRepo(t);
  cpSync(root, copy, { recursive: true, filter: (src) => !src.includes(".speclaw") });
  await buildIndex(copy);
  return copy;
}

/** Log every write to the given tables through triggers in the scratch index. */
function watchWrites(root: string, tables: string[]): void {
  const db = openDb(root);
  db.exec("CREATE TABLE IF NOT EXISTS write_log (tbl TEXT NOT NULL, op TEXT NOT NULL)");
  for (const tbl of tables) {
    for (const op of ["INSERT", "UPDATE", "DELETE"]) {
      db.exec(
        `CREATE TRIGGER IF NOT EXISTS log_${tbl}_${op} AFTER ${op} ON ${tbl}
         BEGIN INSERT INTO write_log(tbl, op) VALUES ('${tbl}', '${op}'); END`,
      );
    }
  }
  db.close();
}

const loggedWrites = (root: string): string[] =>
  rows(root, "SELECT tbl, op FROM write_log").map((r) => `${r.tbl}:${r.op}`);

// Covers: req~reindex-on-edit~1
test("indexFiles picks up an edited body and a new symbol", async (t) => {
  const root = await indexed(t);
  write(
    root,
    "src/core/mid.ts",
    `import { leaf } from "./leaf.js";\nexport function mid(): number {\n  return leaf() + 42;\n}\n` +
      "export function fresh(): number {\n  return mid();\n}\n",
  );
  const res = await indexFiles(root, ["src/core/mid.ts"]);
  assert.deepEqual(res.reindexed, ["src/core/mid.ts"]);
  assert.equal(res.stale, false);
  assert.match(explore(root, "mid").symbol!.source, /leaf\(\) \+ 42/);
  assert.equal(explore(root, "fresh").found, true);
  assert.equal(meta(root, "post_pending"), "1");
});

// Covers: req~reindex-on-edit~1
test("indexFiles on an unchanged file writes no node or edge and sets no marker", async (t) => {
  const root = await indexed(t);
  watchWrites(root, ["nodes", "edges"]);
  const res = await indexFiles(root, [path.join(root, "src/core/mid.ts")]);
  assert.deepEqual(res.unchanged, ["src/core/mid.ts"]);
  assert.deepEqual(loggedWrites(root), []);
  assert.equal(meta(root, "post_pending"), undefined);
});

// Covers: req~reindex-on-edit~1, req~edge-ids-survive-reindex~1
test("indexFiles removes a deleted file and leaves no dangling destination", async (t) => {
  const root = await indexed(t);
  rmSync(path.join(root, "src/core/leaf.ts"));
  const res = await indexFiles(root, ["src/core/leaf.ts"]);
  assert.deepEqual(res.removed, ["src/core/leaf.ts"]);
  const g = graph(root);
  assert.ok(!g.files.some((f) => f.path === "src/core/leaf.ts"));
  assert.equal(
    rows(
      root,
      `SELECT COUNT(*) AS n FROM edges
       WHERE dst_node_id IS NOT NULL AND dst_node_id NOT IN (SELECT id FROM nodes)`,
    )[0]!.n,
    0,
  );
  assert.equal(meta(root, "post_pending"), "1");
  // a second call for the same missing path has nothing left to remove
  const again = await indexFiles(root, ["src/core/leaf.ts"]);
  assert.deepEqual(again.skipped, [{ path: "src/core/leaf.ts", reason: "missing" }]);
});

// Covers: req~reindex-on-edit~1
test("indexFiles skips ineligible paths and writes nothing", async (t) => {
  const root = await indexed(t);
  const outside = tmpRepo(t);
  write(outside, "x.ts", "export function x(): void {}\n");
  write(root, "node_modules/x.ts", "export function nm(): void {}\n");
  write(root, "README.md", "# readme\n");
  write(root, "src/big.ts", "// " + "x".repeat(1_500_001) + "\n");
  const before = graph(root);
  const res = await indexFiles(root, [
    path.join(outside, "x.ts"),
    "node_modules/x.ts",
    "README.md",
    "src/big.ts",
  ]);
  assert.deepEqual(
    res.skipped.map((s) => s.reason),
    ["outside", "ignored", "language", "size"],
  );
  assert.deepEqual(graph(root), before);
  assert.equal(meta(root, "post_pending"), undefined);
});

test("classifyIndexPath agrees with the walk on skip-dir segments only", (t) => {
  const root = tmpRepo(t);
  write(root, "src/dist.ts", "export {};\n");
  const c = classifyIndexPath(root, path.join(root, "src/dist.ts"));
  assert.equal(c.eligible, true);
  assert.equal(classifyIndexPath(root, root).eligible, false);
});

// Covers: req~reindex-on-edit~1
test("indexFiles on a stale or missing index writes nothing and creates nothing", async (t) => {
  const bare = tmpRepo(t);
  write(bare, "a.ts", "export function a(): void {}\n");
  const none = await indexFiles(bare, ["a.ts"]);
  assert.equal(none.stale, true);
  assert.ok(!existsSync(path.join(bare, ".speclaw")));

  const root = await indexed(t);
  const db = openDb(root);
  db.exec("INSERT INTO meta(key, value) VALUES ('needs_reindex', '1')");
  db.close();
  write(root, "src/core/mid.ts", "export function changed(): void {}\n");
  const before = graph(root);
  const res = await indexFiles(root, ["src/core/mid.ts"]);
  assert.equal(res.stale, true);
  assert.deepEqual(graph(root), before);
});

// Covers: req~reindex-on-edit~1
test("indexFiles leaves PageRank, indexed_at, and the compact map alone", async (t) => {
  const root = await indexed(t);
  const map = path.join(root, "docs/compass.md");
  const mapBytes = read(root, "docs/compass.md");
  const mapMtime = statSync(map).mtimeMs;
  const at = meta(root, "indexed_at");
  const midIds = rows(
    root,
    "SELECT n.id FROM nodes n JOIN files f ON f.id = n.file_id WHERE f.path = 'src/core/mid.ts'",
  ).map((r) => r.id);
  const prOthers = rows(root, "SELECT node_id, score FROM pagerank ORDER BY node_id").filter(
    (r) => !midIds.includes(r.node_id),
  );
  watchWrites(root, ["pagerank", "embedding_cache"]);

  write(root, "src/core/mid.ts", read(root, "src/core/mid.ts").replace("+ 1", "+ 7"));
  await indexFiles(root, ["src/core/mid.ts"]);

  // only the cascade drop of the replaced nodes' rows; nothing inserted or updated
  const writes = loggedWrites(root);
  assert.ok(
    writes.every((w) => w === "pagerank:DELETE" || w === "embedding_cache:INSERT"),
    writes.join(","),
  );
  assert.deepEqual(
    rows(root, "SELECT node_id, score FROM pagerank ORDER BY node_id").filter(
      (r) => !midIds.includes(r.node_id),
    ),
    prOthers,
  );
  assert.equal(meta(root, "indexed_at"), at);
  assert.equal(read(root, "docs/compass.md"), mapBytes);
  assert.equal(statSync(map).mtimeMs, mapMtime);
  assert.equal(meta(root, "post_pending"), "1");
});

// Covers: req~reindex-on-edit~1
test("indexFiles directory hashes equal a full walk and spare non-ancestors", async (t) => {
  const root = await indexed(t);
  const before = new Map(dirHashes(root).map((r) => [r.path, r.hash]));
  write(root, "src/core/mid.ts", read(root, "src/core/mid.ts").replace("+ 1", "+ 3"));
  write(root, "src/new/deep/n.ts", "export function n(): number {\n  return 0;\n}\n");
  await indexFiles(root, ["src/core/mid.ts", "src/new/deep/n.ts"]);

  const copy = await freshCopy(t, root);
  assert.deepEqual(dirHashes(root), dirHashes(copy));
  const after = new Map(dirHashes(root).map((r) => [r.path, r.hash]));
  for (const dir of ["lib", "src/app"]) assert.equal(after.get(dir), before.get(dir), dir);
  for (const dir of ["", "src", "src/core"]) assert.notEqual(after.get(dir), before.get(dir), dir);

  // deleting the only file of a directory drops that directory's row
  rmSync(path.join(root, "src/new"), { recursive: true });
  await indexFiles(root, ["src/new/deep/n.ts"]);
  const copy2 = await freshCopy(t, root);
  assert.deepEqual(dirHashes(root), dirHashes(copy2));
});

// Covers: req~reindex-on-edit~1, req~edge-ids-survive-reindex~1
test("indexFiles resolution matches a fresh full index", async (t) => {
  const root = await indexed(t);
  write(
    root,
    "src/core/mid.ts",
    `export function pad(): number {\n  return 0;\n}\n` +
      `import { leaf } from "./leaf.js";\nexport function mid(): number {\n  return leaf() + pad();\n}\n`,
  );
  await indexFiles(root, ["src/core/mid.ts"]);
  const copy = await freshCopy(t, root);
  assert.deepEqual(resolved(root), resolved(copy));
  assert.ok(resolved(root).includes("src/app/top.ts:top -call-> src/core/mid.ts:mid"));
});

// Covers: req~reindex-on-edit~1
test("indexFiles adds a file the index has never seen", async (t) => {
  const root = await indexed(t);
  write(root, "lib/extra.ts", `export function extra(): number {\n  return other();\n}\n`);
  const res = await indexFiles(root, ["lib/extra.ts"]);
  assert.deepEqual(res.reindexed, ["lib/extra.ts"]);
  assert.equal(explore(root, "extra").found, true);
  assert.ok(resolved(root).includes("lib/extra.ts:extra -call-> lib/other.ts:other"));
});

// Covers: req~reindex-on-edit~1
test("a full run absorbs a per-file write that lands after it starts", async (t) => {
  const root = await indexed(t);
  write(root, "lib/fresh.ts", "export function freshOne(): number {\n  return 3;\n}\n");
  let attempted = false;
  let blocked = false;
  await buildIndex(root, {
    onProgress: () => {
      if (attempted) return;
      attempted = true;
      // A per-file child committing the new file's row while the full run is
      // under way: it must wait for the full run, not slip in under it.
      const other = new DatabaseSync(path.join(root, ".speclaw", "index.db"));
      try {
        other.exec("PRAGMA busy_timeout = 0;");
        other
          .prepare("INSERT INTO files(path, hash, lang) VALUES (?, ?, ?)")
          .run("lib/fresh.ts", "child", "typescript");
      } catch {
        blocked = true;
      } finally {
        other.close();
      }
    },
  });
  assert.equal(blocked, true, "the per-file write waits for the full run's lock");
  assert.equal(rows(root, "SELECT COUNT(*) AS n FROM files WHERE path = 'lib/fresh.ts'")[0]!.n, 1);
  assert.equal(explore(root, "freshOne").found, true);
});

// Covers: req~reindex-on-edit~1
test("a full run keeps a file a per-file run indexed after the walk", async (t) => {
  const root = await indexed(t);
  await buildIndex(root, {
    hooks: {
      // A file created and indexed by a per-file child after the walk passed
      // its directory but before the full run took the lock.
      afterWalk: async () => {
        write(root, "lib/late.ts", "export function lateOne(): number {\n  return 7;\n}\n");
        const res = await indexFiles(root, ["lib/late.ts"]);
        assert.deepEqual(res.reindexed, ["lib/late.ts"]);
      },
    },
  });
  assert.equal(rows(root, "SELECT COUNT(*) AS n FROM files WHERE path = 'lib/late.ts'")[0]!.n, 1);
  assert.equal(explore(root, "lateOne").found, true);

  // The next full run walks it normally and agrees.
  const again = await buildIndex(root);
  assert.equal(again.removed, 0);
  assert.equal(explore(root, "lateOne").found, true);
});

// Covers: req~reindex-on-edit~1
test("a full run that cannot take the lock closes its connection and rethrows", async (t) => {
  const root = await indexed(t);
  const holder = new DatabaseSync(path.join(root, ".speclaw", "index.db"));
  t.after(() => {
    if (holder.isOpen) holder.close();
  });
  let conn: DatabaseSync | undefined;
  await assert.rejects(
    buildIndex(root, {
      hooks: {
        // openDb itself may write, so the second connection takes the write
        // lock only once the full run's connection is open.
        onOpen: (db) => {
          conn = db;
          db.exec("PRAGMA busy_timeout = 0;");
          holder.exec("BEGIN IMMEDIATE");
        },
      },
    }),
    /locked|busy/i,
  );
  assert.ok(conn, "the seam saw the connection");
  assert.equal(conn.isOpen, false, "the connection is closed after SQLITE_BUSY");
  holder.exec("ROLLBACK");
});

const coverageFor = (root: string, file: string): Row[] =>
  rows(root, `SELECT name, node_id FROM coverage_links WHERE file_path = '${file}'`);

// Covers: req~reindex-on-edit~1
test("removing a file drops its file-level coverage links (per-file and full run)", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  const covered =
    "export function cov(): number {\n  return 1;\n}\n\n\n\n// Covers: req~file-level~1\n";
  write(root, "lib/cov-a.ts", covered);
  write(root, "lib/cov-b.ts", covered);
  await buildIndex(root);
  for (const f of ["lib/cov-a.ts", "lib/cov-b.ts"]) {
    assert.ok(
      coverageFor(root, f).some((r) => r.node_id === null),
      `${f} has a file-level coverage link`,
    );
  }

  rmSync(path.join(root, "lib/cov-a.ts"));
  const res = await indexFiles(root, ["lib/cov-a.ts"]);
  assert.deepEqual(res.removed, ["lib/cov-a.ts"]);
  assert.deepEqual(coverageFor(root, "lib/cov-a.ts"), []);

  rmSync(path.join(root, "lib/cov-b.ts"));
  await buildIndex(root);
  assert.deepEqual(coverageFor(root, "lib/cov-b.ts"), []);
});

// Covers: req~reindex-on-edit~1
test("indexFiles writes nothing when a full reindex is flagged while it waits", async (t) => {
  const root = await indexed(t);
  write(root, "src/core/leaf.ts", "export function leaf(): number {\n  return 77;\n}\n");
  const before = graph(root);
  // Another process holds the write lock and flags a full reindex: the probe
  // still sees a current index, so only a re-check under the lock catches it.
  const holder = spawn(
    process.execPath,
    [
      "-e",
      `const { DatabaseSync } = require("node:sqlite");
       const db = new DatabaseSync(process.env.DB_FILE);
       db.exec("BEGIN IMMEDIATE");
       db.exec("INSERT INTO meta(key, value) VALUES ('needs_reindex', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
       process.stdout.write("locked\\n");
       setTimeout(() => { db.exec("COMMIT"); db.close(); }, 800);`,
    ],
    {
      env: { ...process.env, DB_FILE: path.join(root, ".speclaw", "index.db") },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const exited = new Promise<number | null>((resolve) => holder.on("exit", resolve));
  await new Promise<void>((resolve) =>
    holder.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes("locked")) resolve();
    }),
  );
  const res = await indexFiles(root, ["src/core/leaf.ts"]);
  assert.equal(await exited, 0);
  assert.equal(res.stale, true);
  assert.deepEqual(res.reindexed, []);
  assert.deepEqual(graph(root), before);
  assert.equal(meta(root, "post_pending"), undefined);
});

/** True when the filesystem holding `dir` folds case (default APFS, NTFS). */
function caseInsensitiveFs(dir: string): boolean {
  const probe = path.join(dir, "case-probe-Aa.tmp");
  writeFileSync(probe, "");
  try {
    return existsSync(path.join(dir, "CASE-PROBE-aa.tmp"));
  } finally {
    rmSync(probe);
  }
}

const filePaths = (root: string): string[] =>
  rows(root, "SELECT path FROM files ORDER BY path").map((r) => r.path as string);

// Covers: req~reindex-on-edit~1
test("a full run drops the old row of a case-only rename", async (t) => {
  const root = tmpRepo(t);
  if (!caseInsensitiveFs(root)) {
    t.skip("case-sensitive filesystem: a case-only rename is an ordinary rename");
    return;
  }
  seed(root);
  write(root, "lib/Case.ts", "export function caseOnly(): number {\n  return 5;\n}\n");
  await buildIndex(root);
  renameSync(path.join(root, "lib/Case.ts"), path.join(root, "lib/case.ts"));

  const stats = await buildIndex(root);
  assert.equal(stats.removed, 1);
  const lib = filePaths(root).filter((p) => p.toLowerCase() === "lib/case.ts");
  assert.deepEqual(lib, ["lib/case.ts"]);
  assert.equal(rows(root, "SELECT COUNT(*) AS n FROM nodes WHERE name = 'caseOnly'")[0]!.n, 1);

  const again = await buildIndex(root, { force: true });
  assert.equal(again.removed, 0);
  assert.deepEqual(
    filePaths(root).filter((p) => p.toLowerCase() === "lib/case.ts"),
    ["lib/case.ts"],
  );
});

// Covers: req~reindex-on-edit~1
test("a full run drops rows under a directory replaced by a symlink", async (t) => {
  if (process.platform === "win32") {
    t.skip("directory symlinks need elevated rights on Windows");
    return;
  }
  const root = tmpRepo(t);
  seed(root);
  write(root, "pkg/a.ts", "export function pkgOnly(): number {\n  return 6;\n}\n");
  await buildIndex(root);
  renameSync(path.join(root, "pkg"), path.join(root, "real"));
  symlinkSync("real", path.join(root, "pkg"), "dir");

  const stats = await buildIndex(root);
  assert.equal(stats.removed, 1);
  const paths = filePaths(root);
  assert.ok(paths.includes("real/a.ts"));
  assert.ok(!paths.includes("pkg/a.ts"), "the row under the symlink path is gone");
  assert.equal(rows(root, "SELECT COUNT(*) AS n FROM nodes WHERE name = 'pkgOnly'")[0]!.n, 1);
});

// Covers: req~reindex-on-edit~1
test("indexFiles registers a case-variant path under the walk's spelling", async (t) => {
  const root = await indexed(t);
  if (!caseInsensitiveFs(root)) {
    t.skip("case-sensitive filesystem: a case variant is a different file");
    return;
  }
  write(root, "lib/other.ts", "export function other(): number {\n  return 10;\n}\n");
  const res = await indexFiles(root, ["LIB/Other.ts"]);
  assert.deepEqual(res.reindexed, ["lib/other.ts"]);
  assert.deepEqual(
    filePaths(root).filter((p) => p.toLowerCase() === "lib/other.ts"),
    ["lib/other.ts"],
  );
  assert.equal(rows(root, "SELECT COUNT(*) AS n FROM nodes WHERE name = 'other'")[0]!.n, 1);
});

// Covers: req~reindex-on-edit~1
test("indexFiles through a symlinked directory registers the real path", async (t) => {
  if (process.platform === "win32") {
    t.skip("directory symlinks need elevated rights on Windows");
    return;
  }
  const root = await indexed(t);
  symlinkSync("lib", path.join(root, "alias"), "dir");
  write(root, "lib/other.ts", "export function other(): number {\n  return 11;\n}\n");
  const res = await indexFiles(root, ["alias/other.ts"]);
  assert.deepEqual(res.reindexed, ["lib/other.ts"]);
  assert.ok(!filePaths(root).includes("alias/other.ts"));
});

test("walkWouldYield accepts only the exact path the walk yields", (t) => {
  const root = tmpRepo(t);
  write(root, "lib/real.ts", "export const r = 1;\n");
  write(root, "lib/notes.md", "# notes\n");
  write(root, "node_modules/x/index.ts", "export const x = 1;\n");
  assert.equal(walkWouldYield(root, "lib/real.ts"), true);
  assert.equal(walkWouldYield(root, "lib/gone.ts"), false, "missing leaf");
  assert.equal(walkWouldYield(root, "nope/real.ts"), false, "missing directory");
  assert.equal(walkWouldYield(root, "lib/real.ts/x.ts"), false, "file used as a directory");
  assert.equal(walkWouldYield(root, "lib"), false, "a directory is not a file");
  assert.equal(walkWouldYield(root, "lib/notes.md"), false, "unindexed language");
  assert.equal(walkWouldYield(root, "node_modules/x/index.ts"), false, "skipped directory");
  assert.equal(walkWouldYield(root, "lib/../lib/real.ts"), false, "dot segments");
  assert.equal(walkWouldYield(root, "lib//real.ts"), false, "empty segment");
  assert.equal(walkWouldYield(root, ""), false, "empty path");
  if (caseInsensitiveFs(root)) {
    assert.equal(walkWouldYield(root, "lib/Real.ts"), false, "leaf case variant");
    assert.equal(walkWouldYield(root, "Lib/real.ts"), false, "directory case variant");
  }
});

test("walkWouldYield rejects any symlinked segment", (t) => {
  if (process.platform === "win32") {
    t.skip("symlinks need elevated rights on Windows");
    return;
  }
  const root = tmpRepo(t);
  write(root, "lib/real.ts", "export const r = 1;\n");
  symlinkSync("lib", path.join(root, "alias"), "dir");
  symlinkSync("real.ts", path.join(root, "lib/link.ts"), "file");
  assert.equal(walkWouldYield(root, "alias/real.ts"), false, "symlinked directory");
  assert.equal(walkWouldYield(root, "lib/link.ts"), false, "symlinked file");
  assert.equal(walkWouldYield(root, "lib/real.ts"), true);
});

test("walkWouldYield reuses a shared listing cache", (t) => {
  const root = tmpRepo(t);
  write(root, "lib/a.ts", "export const a = 1;\n");
  const listings = new Map<string, Set<string> | null>();
  assert.equal(walkWouldYield(root, "lib/a.ts", listings), true);
  assert.ok(listings.get(path.join(root, "lib"))?.has("a.ts"));
  // A later file is invisible through the cached listing, as in one walk.
  write(root, "lib/b.ts", "export const b = 1;\n");
  assert.equal(walkWouldYield(root, "lib/b.ts", listings), false);
  assert.equal(walkWouldYield(root, "lib/b.ts"), true);
  assert.equal(walkWouldYield(root, "missing/a.ts", listings), false);
  assert.equal(walkWouldYield(root, "missing/b.ts", listings), false);
  assert.equal(listings.get(path.join(root, "missing")), undefined);
});
