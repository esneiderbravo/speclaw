import { test } from "node:test";
import assert from "node:assert/strict";
import { write, tmpRepo } from "../helpers/env.js";
import { seedSampleRepo } from "../helpers/fixtures.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { openDb } from "../../src/modules/compass/db.js";

test("reindexing file A leaves nodes and edges owned by B untouched", async (t) => {
  const root = tmpRepo(t);
  seedSampleRepo(root);
  await buildIndex(root);

  const db = openDb(root);
  const fileB = db.prepare("SELECT id FROM files WHERE path = ?").get("src/main.ts") as {
    id: number;
  };
  assert.ok(fileB);
  const nodesBefore = db
    .prepare(
      "SELECT id, name, kind, start_line, end_line, content_hash FROM nodes WHERE file_id = ? ORDER BY id",
    )
    .all(fileB.id);
  const edgesBefore = db
    .prepare(
      "SELECT id, src_node_id, src_file_id, dst_name, dst_node_id, kind, line FROM edges WHERE src_file_id = ? ORDER BY id",
    )
    .all(fileB.id);
  db.close();

  write(root, "src/util.ts", `export function helper(): number {\n  return 43;\n}\n`);
  await buildIndex(root);

  const db2 = openDb(root);
  const nodesAfter = db2
    .prepare(
      "SELECT id, name, kind, start_line, end_line, content_hash FROM nodes WHERE file_id = ? ORDER BY id",
    )
    .all(fileB.id);
  const edgesAfter = db2
    .prepare(
      "SELECT id, src_node_id, src_file_id, dst_name, dst_node_id, kind, line FROM edges WHERE src_file_id = ? ORDER BY id",
    )
    .all(fileB.id);
  db2.close();

  assert.deepEqual(nodesAfter, nodesBefore);
  assert.deepEqual(edgesAfter, edgesBefore);
});
