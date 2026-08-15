import { test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { tmpRepo } from "../helpers/env.js";
import { openDb } from "../../src/modules/compass/db.js";
import { runDepsLaw } from "../../src/modules/foundation/deps.js";
import type { DepsRule, Law } from "../../src/modules/foundation/laws.js";

/** A tiny graph seeder: one node per file as the resolvable target of edges. */
function seed(db: DatabaseSync, files: string[]) {
  const fileId = new Map<string, number>();
  const nodeId = new Map<string, number>();
  for (const f of files) {
    const r = db
      .prepare("INSERT INTO files(path, hash, lang) VALUES (?, 'h', 'typescript')")
      .run(f);
    const fid = Number(r.lastInsertRowid);
    fileId.set(f, fid);
    const n = db
      .prepare(
        "INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte) " +
          "VALUES (?, ?, 'function', 1, 1, 0, 0)",
      )
      .run(fid, `sym_${f}`);
    nodeId.set(f, Number(n.lastInsertRowid));
  }
  /** Add a resolved edge src→dst (or unresolved when dst is null). */
  const edge = (src: string, dst: string | null, line = 1, kind = "call") => {
    db.prepare(
      "INSERT INTO edges(src_node_id, src_file_id, dst_name, dst_node_id, kind, line) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
    ).run(nodeId.get(src)!, fileId.get(src)!, "x", dst ? nodeId.get(dst)! : null, kind, line);
  };
  return { edge };
}

const depsLaw = (rule: DepsRule, over: Partial<Law> = {}): Law => ({
  id: "law~d~1",
  title: "D",
  severity: "error",
  scope: [],
  prose: "no forbidden dependency",
  verification: { kind: "deps", rule },
  enforcement: "gate",
  source: { file: "docs/standards/architecture.md" },
  ...over,
});

test("forbidden dependency is detected with the source file and line", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  seed(db, ["src/domain/order.ts", "src/infra/http.ts"]).edge(
    "src/domain/order.ts",
    "src/infra/http.ts",
    7,
  );
  const res = runDepsLaw(db, depsLaw({ from: "^src/domain/", to: "^src/infra/" }));
  db.close();
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0]?.file, "src/domain/order.ts");
  assert.equal(res.findings[0]?.line, 7);
  assert.match(res.findings[0]?.detail ?? "", /src\/infra\/http\.ts/);
});

test("group matching forbids cross-feature imports but allows same-feature", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const g = seed(db, ["src/features/a/x.ts", "src/features/a/z.ts", "src/features/b/y.ts"]);
  g.edge("src/features/a/x.ts", "src/features/b/y.ts"); // a → b: violation
  g.edge("src/features/a/x.ts", "src/features/a/z.ts"); // a → a: allowed by toNot $1
  const res = runDepsLaw(
    db,
    depsLaw({ from: "^src/features/([^/]+)/", to: "^src/features/", toNot: "^src/features/$1/" }),
  );
  db.close();
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0]?.file, "src/features/a/x.ts");
  assert.match(res.findings[0]?.detail ?? "", /src\/features\/b\/y\.ts/);
});

test("unresolved edges in scope are counted, not treated as clean", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const g = seed(db, ["src/domain/order.ts", "src/infra/http.ts"]);
  g.edge("src/domain/order.ts", null); // unresolved, inside from-scope
  const res = runDepsLaw(db, depsLaw({ from: "^src/domain/", to: "^src/infra/" }));
  db.close();
  assert.equal(res.findings.length, 0);
  assert.equal(res.unresolved, 1);
});

test("required dependency: absence is the violation", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const g = seed(db, ["src/api/a.ts", "src/api/b.ts", "src/service/s.ts"]);
  g.edge("src/api/a.ts", "src/service/s.ts"); // a satisfies the requirement
  // b has no edge to a service → violation
  const res = runDepsLaw(db, depsLaw({ from: "^src/api/", to: "^src/service/", type: "required" }));
  db.close();
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0]?.file, "src/api/b.ts");
});

test("paths filter restricts the source files considered", (t) => {
  const root = tmpRepo(t);
  const db = openDb(root);
  const g = seed(db, ["src/domain/a.ts", "src/domain/b.ts", "src/infra/x.ts"]);
  g.edge("src/domain/a.ts", "src/infra/x.ts");
  g.edge("src/domain/b.ts", "src/infra/x.ts");
  const res = runDepsLaw(db, depsLaw({ from: "^src/domain/", to: "^src/infra/" }), [
    "src/domain/a.ts",
  ]);
  db.close();
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0]?.file, "src/domain/a.ts");
});
