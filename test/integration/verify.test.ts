import { test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { tmpRepo } from "../helpers/env.js";
import { openDb } from "../../src/modules/compass/db.js";
import { writeLawManifest, type Law } from "../../src/modules/foundation/laws.js";
import { verifyLaws } from "../../src/modules/foundation/verify.js";

/** Seed files + one node each, and return an edge-adder (dst null = unresolved). */
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
  return (src: string, dst: string | null) =>
    db
      .prepare(
        "INSERT INTO edges(src_node_id, src_file_id, dst_name, dst_node_id, kind, line) " +
          "VALUES (?, ?, 'x', ?, 'call', 1)",
      )
      .run(nodeId.get(src)!, fileId.get(src)!, dst ? nodeId.get(dst)! : null);
}

const law = (id: string, verification: Law["verification"], over: Partial<Law> = {}): Law => ({
  id,
  title: id,
  severity: "error",
  scope: [],
  prose: `enforce ${id}`,
  verification,
  enforcement: "gate",
  source: { file: "docs/standards/architecture.md" },
  ...over,
});

/** Build an index with a domain→infra violation, a clean ui file, and an unresolved edge. */
function buildFixture(root: string) {
  const db = openDb(root);
  const edge = seed(db, [
    "src/domain/order.ts",
    "src/domain/unknown.ts",
    "src/infra/http.ts",
    "src/ui/button.ts",
  ]);
  edge("src/domain/order.ts", "src/infra/http.ts"); // the failing dependency
  edge("src/domain/unknown.ts", null); // an unresolved edge → unknown
  db.close();
}

const FIXTURE_LAWS: Law[] = [
  // passes: no ui → infra edge exists
  law("law~ui-clean~1", { kind: "deps", rule: { from: "^src/ui/", to: "^src/infra/" } }),
  // fails: domain/order.ts → infra/http.ts exists
  law("law~no-domain-to-infra~1", {
    kind: "deps",
    rule: { from: "^src/domain/order", to: "^src/infra/" },
  }),
  // unknown: domain/unknown.ts only has an unresolved edge
  law("law~unknown-domain~1", {
    kind: "deps",
    rule: { from: "^src/domain/unknown", to: "^src/infra/" },
  }),
];

test("verify distinguishes passed, failed, and unknown in one indexed run", (t) => {
  const root = tmpRepo(t);
  buildFixture(root);
  writeLawManifest(root, { version: 1, laws: FIXTURE_LAWS });

  const report = verifyLaws({ projectPath: root });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.unknown, 1);
  assert.equal(report.summary.skipped, 0);
  // Disjoint terminal buckets: every evaluated law counted exactly once.
  const { passed, failed, skipped, unknown } = report.summary;
  assert.equal(passed + failed + skipped + unknown, FIXTURE_LAWS.length);

  const fail = report.findings.find((f) => f.lawId === "law~no-domain-to-infra~1");
  assert.equal(fail?.file, "src/domain/order.ts");
  assert.ok(report.unknown.some((u) => u.lawId === "law~unknown-domain~1"));
});

test("missing index skips every batch law with reason no-index", (t) => {
  const root = tmpRepo(t);
  // Manifest but no index built.
  writeLawManifest(root, { version: 1, laws: FIXTURE_LAWS });
  const report = verifyLaws({ projectPath: root });
  assert.equal(report.summary.passed, 0);
  assert.equal(report.summary.skipped, FIXTURE_LAWS.length);
  assert.ok(report.skipped.every((s) => s.reason === "no-index"));
  assert.ok(report.skipped[0]?.detail?.includes("compass_index"));
});

test("engines filter runs only the requested engine", (t) => {
  const root = tmpRepo(t);
  buildFixture(root);
  writeLawManifest(root, {
    version: 1,
    laws: [...FIXTURE_LAWS, law("law~cycle~1", { kind: "graph", rule: { circular: true } })],
  });
  const report = verifyLaws({ projectPath: root, engines: ["graph"] });
  // Only the graph law ran; the three deps laws were not evaluated.
  assert.equal(report.summary.evaluated, 1);
});

test("lawIds filter restricts evaluation to the named law", (t) => {
  const root = tmpRepo(t);
  buildFixture(root);
  writeLawManifest(root, { version: 1, laws: FIXTURE_LAWS });
  const report = verifyLaws({ projectPath: root, lawIds: ["law~no-domain-to-infra~1"] });
  assert.equal(report.summary.evaluated, 1);
  assert.equal(report.summary.failed, 1);
});

test("a law with an unimplemented backend is inert — not counted at all", (t) => {
  const root = tmpRepo(t);
  buildFixture(root);
  writeLawManifest(root, {
    version: 1,
    laws: [law("law~ast~1", { kind: "ast" }), ...FIXTURE_LAWS],
  });
  const report = verifyLaws({ projectPath: root });
  // The ast law is not a batch backend: it appears in no terminal bucket.
  assert.equal(report.summary.evaluated, FIXTURE_LAWS.length);
  assert.ok(!report.skipped.some((s) => s.lawId === "law~ast~1"));
  assert.ok(!report.findings.some((f) => f.lawId === "law~ast~1"));
});

test("no manifest yields an empty, well-formed report", (t) => {
  const root = tmpRepo(t);
  const report = verifyLaws({ projectPath: root });
  assert.deepEqual(report.summary, {
    evaluated: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    unknown: 0,
  });
  assert.deepEqual(report.findings, []);
});
