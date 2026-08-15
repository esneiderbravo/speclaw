import { test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { tmpRepo } from "../helpers/env.js";
import { openDb } from "../../src/modules/compass/db.js";
import { runGraphLaw, tarjanSCC } from "../../src/modules/foundation/graph.js";
import type { GraphRule, Law } from "../../src/modules/foundation/laws.js";

/** Seed files (one node each) and return an edge-adder keyed by file path. */
function seed(db: DatabaseSync, files: string[]) {
  const fileId = new Map<string, number>();
  const nodeId = new Map<string, number>();
  for (const f of files) {
    const r = db
      .prepare("INSERT INTO files(path, hash, lang) VALUES (?, 'h', 'typescript')")
      .run(f);
    fileId.set(f, Number(r.lastInsertRowid));
    const n = db
      .prepare(
        "INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte) " +
          "VALUES (?, ?, 'function', 1, 1, 0, 0)",
      )
      .run(Number(r.lastInsertRowid), `sym_${f}`);
    nodeId.set(f, Number(n.lastInsertRowid));
  }
  return (src: string, dst: string) =>
    db
      .prepare(
        "INSERT INTO edges(src_node_id, src_file_id, dst_name, dst_node_id, kind, line) " +
          "VALUES (?, ?, 'x', ?, 'call', 1)",
      )
      .run(nodeId.get(src)!, fileId.get(src)!, nodeId.get(dst)!);
}

const graphLaw = (rule: GraphRule): Law => ({
  id: "law~g~1",
  title: "G",
  severity: "error",
  scope: [],
  prose: "no dependency cycles",
  verification: { kind: "graph", rule },
  enforcement: "gate",
  source: { file: "docs/standards/architecture.md" },
});

test("tarjanSCC groups a cycle and isolates acyclic nodes", () => {
  const adj = new Map<string, string[]>([
    ["a", ["b"]],
    ["b", ["c"]],
    ["c", ["a"]],
    ["d", ["a"]],
  ]);
  const sccs = tarjanSCC(adj).map((s) => s.sort());
  const big = sccs.find((s) => s.length > 1)!;
  assert.deepEqual(big, ["a", "b", "c"]);
  assert.ok(sccs.some((s) => s.length === 1 && s[0] === "d"));
});

test("reports the minimal cycle inside a larger component", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const files = Array.from({ length: 8 }, (_, i) => `src/f${i}.ts`);
  const edge = seed(db, files);
  // An 8-file ring: f0→f1→…→f7→f0 (one SCC of size 8).
  for (let i = 0; i < 8; i++) edge(files[i]!, files[(i + 1) % 8]!);
  // A chord f2→f0 creates a shorter 3-file cycle f0→f1→f2→f0.
  edge(files[2]!, files[0]!);
  const res = runGraphLaw(db, graphLaw({ circular: true }));
  db.close();
  assert.equal(res.findings.length, 1);
  assert.match(res.findings[0]?.detail ?? "", /SCC size 8/);
  // The reported cycle is the minimal one: three distinct files.
  const cycle = (res.findings[0]!.detail ?? "").replace(/ \(SCC.*/, "").replace("cycle: ", "");
  const distinct = new Set(cycle.split(" → "));
  assert.equal(distinct.size, 3);
});

test("an intra-file self-dependency is not a cycle", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const edge = seed(db, ["src/a.ts", "src/b.ts"]);
  edge("src/a.ts", "src/b.ts"); // acyclic cross-file
  edge("src/a.ts", "src/a.ts"); // intra-file self edge — excluded from the graph
  const res = runGraphLaw(db, graphLaw({ circular: true }));
  db.close();
  assert.equal(res.findings.length, 0);
});

test("cycle detection survives a deep import chain without overflowing", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const n = 8000;
  const files = Array.from({ length: n }, (_, i) => `src/c${i}.ts`);
  const edge = seed(db, files);
  for (let i = 0; i < n - 1; i++) edge(files[i]!, files[i + 1]!); // a straight chain, acyclic
  const res = runGraphLaw(db, graphLaw({ circular: true }));
  db.close();
  assert.equal(res.findings.length, 0, "a chain has no cycle");
});

test("reachable forbids a transitive path from `from` to `to`", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const edge = seed(db, ["src/a.ts", "src/mid.ts", "src/z.ts"]);
  edge("src/a.ts", "src/mid.ts");
  edge("src/mid.ts", "src/z.ts");
  const hit = runGraphLaw(db, graphLaw({ reachable: true, from: "^src/a", to: "^src/z" }));
  assert.equal(hit.findings.length, 1);
  assert.equal(hit.findings[0]?.file, "src/a.ts");
  const miss = runGraphLaw(db, graphLaw({ reachable: true, from: "^src/a", to: "^src/none" }));
  db.close();
  assert.equal(miss.findings.length, 0);
});
