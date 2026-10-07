import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex, indexFiles } from "../../src/modules/compass/indexer.js";
import { openDb } from "../../src/modules/compass/db.js";
import { impact } from "../../src/modules/compass/query.js";

const A_REL = "lib/a.ts";
const A_SRC = "export function foo(): number {\n  return 1;\n}\n";
const A_EDITED =
  "export function added(): number {\n  return 2;\n}\n" +
  "export function foo(): number {\n  return 1;\n}\n";

/**
 * `b.ts` (root) calls `foo` in `lib/a.ts`. The walk visits root files before
 * subdirectories, so `a.ts` holds the highest node ids: re-extracting it frees
 * those rowids and SQLite hands them to the new nodes, which is the case a
 * check for ids missing from `nodes` cannot see.
 */
function seed(root: string): void {
  write(root, A_REL, A_SRC);
  write(
    root,
    "b.ts",
    `import { foo } from "./lib/a.js";\nexport function bar(): number {\n  return foo();\n}\n`,
  );
}

function fooId(root: string): number {
  const db = openDb(root);
  try {
    const row = db
      .prepare(
        `SELECT n.id FROM nodes n JOIN files f ON f.id = n.file_id
         WHERE n.name = 'foo' AND f.path = ?`,
      )
      .get(A_REL) as { id: number } | undefined;
    assert.ok(row, "foo is indexed");
    return row.id;
  } finally {
    db.close();
  }
}

function danglingCount(root: string): number {
  const db = openDb(root);
  try {
    return Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM edges
             WHERE dst_node_id IS NOT NULL AND dst_node_id NOT IN (SELECT id FROM nodes)`,
          )
          .get() as { n: number }
      ).n,
    );
  } finally {
    db.close();
  }
}

/** The node `bar`'s call edge to `foo` points at, or null. */
function barCallTarget(root: string): { dst: number | null; name: string | null } {
  const db = openDb(root);
  try {
    const row = db
      .prepare(
        `SELECT e.dst_node_id AS dst, d.name AS name FROM edges e
         JOIN nodes s ON s.id = e.src_node_id
         LEFT JOIN nodes d ON d.id = e.dst_node_id
         WHERE e.kind = 'call' AND e.dst_name = 'foo' AND s.name = 'bar'`,
      )
      .get() as { dst: number | null; name: string | null };
    return { dst: row.dst, name: row.name };
  } finally {
    db.close();
  }
}

function exactCallers(root: string, nodeId: number): string[] {
  const res = impact(root, { nodeId, format: "flat", edgeKinds: ["call"] });
  return (res.nodes ?? []).filter((n) => n.resolution === "exact").map((n) => n.name);
}

// Covers: req~edge-ids-survive-reindex~1
test("callers survive a full re-index of the callee file", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);
  assert.deepEqual(exactCallers(root, fooId(root)), ["bar"]);

  write(root, A_REL, A_EDITED);
  await buildIndex(root);

  const foo = fooId(root);
  assert.deepEqual(barCallTarget(root), { dst: foo, name: "foo" });
  assert.deepEqual(exactCallers(root, foo), ["bar"]);
  assert.equal(danglingCount(root), 0);
});

// Covers: req~edge-ids-survive-reindex~1
test("callers survive a per-file reindex of the callee file", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);

  write(root, A_REL, A_EDITED);
  await indexFiles(root, [A_REL]);

  const foo = fooId(root);
  assert.deepEqual(barCallTarget(root), { dst: foo, name: "foo" });
  assert.deepEqual(exactCallers(root, foo), ["bar"]);
  assert.equal(danglingCount(root), 0);
});

// Covers: req~edge-ids-survive-reindex~1
test("a removed symbol leaves its callers unresolved through indexFiles", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);

  write(root, A_REL, "export function added(): number {\n  return 2;\n}\n");
  await indexFiles(root, [A_REL]);

  assert.deepEqual(barCallTarget(root), { dst: null, name: null });
  assert.equal(danglingCount(root), 0);
});

// Covers: req~edge-ids-survive-reindex~1
test("a removed symbol leaves its callers unresolved", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);

  write(root, A_REL, "export function added(): number {\n  return 2;\n}\n");
  await buildIndex(root);

  assert.deepEqual(barCallTarget(root), { dst: null, name: null });
  const db = openDb(root);
  let ids: number[];
  try {
    ids = (
      db
        .prepare(`SELECT n.id FROM nodes n JOIN files f ON f.id = n.file_id WHERE f.path = ?`)
        .all(A_REL) as Array<{ id: number }>
    ).map((r) => r.id);
  } finally {
    db.close();
  }
  for (const id of ids) assert.ok(!exactCallers(root, id).includes("bar"), `node ${id}`);
  assert.equal(danglingCount(root), 0);
});

// Covers: req~edge-ids-survive-reindex~1
test("a removed file leaves no dangling destination", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);

  rmSync(path.join(root, A_REL));
  // A new file takes the freed rowids: no surviving edge may point at them.
  write(root, "lib/c.ts", "export function other(): number {\n  return 3;\n}\n");
  await buildIndex(root);

  assert.equal(danglingCount(root), 0);
  assert.deepEqual(barCallTarget(root), { dst: null, name: null });
});

// Covers: req~edge-ids-survive-reindex~1
test("a file removed through indexFiles leaves no dangling destination", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);

  rmSync(path.join(root, A_REL));
  await indexFiles(root, [A_REL]);
  write(root, "lib/c.ts", "export function other(): number {\n  return 3;\n}\n");
  await indexFiles(root, ["lib/c.ts"]);

  assert.equal(danglingCount(root), 0);
  assert.deepEqual(barCallTarget(root), { dst: null, name: null });
});
