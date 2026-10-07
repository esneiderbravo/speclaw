import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex, resolveEdges, stripJsonComments } from "../../src/modules/compass/indexer.js";
import { importBindings } from "../../src/modules/compass/extract.js";
import { openDb } from "../../src/modules/compass/db.js";
import { explore, impact } from "../../src/modules/compass/query.js";

/** An unambiguous graph: relative, multi-line, and alias imports; calls; a builtin; a member call. */
function seed(root: string): void {
  write(
    root,
    "tsconfig.json",
    `{ "compilerOptions": { "baseUrl": "src", "paths": { "#lib/*": ["lib/*"] } } }\n`,
  );
  write(
    root,
    "src/lib/math.ts",
    "export function add(a: number, b: number): number { return a + b; }\n",
  );
  write(
    root,
    "src/calc.ts",
    `import {
  add,
} from "./lib/math.js";
export function total(xs: number[]): number {
  xs.push(0);
  return xs.reduce((s, x) => add(s, x), 0);
}
`,
  );
  write(
    root,
    "src/report.ts",
    `import { total } from "#lib/../calc.js";\nexport const r = total([1]);\n`,
  );
  write(root, "src/base.ts", `import { add } from "lib/math.js";\nexport const two = add(1, 1);\n`);
  write(
    root,
    "test/calc.test.ts",
    `import { total } from "../src/calc.js";\nimport { test } from "node:test";\ntest("t", () => { total([1, 2]); });\n`,
  );
}

function snapshot(root: string): Array<{ id: number; dst: number | null }> {
  const db = openDb(root);
  try {
    return db.prepare("SELECT id, dst_node_id AS dst FROM edges ORDER BY id").all() as Array<{
      id: number;
      dst: number | null;
    }>;
  } finally {
    db.close();
  }
}

// Covers: req~impact-id-first~1
test("resolveEdges with and without fileIds matches a full index", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);
  const full = snapshot(root);
  assert.ok(full.some((e) => e.dst !== null));

  const db = openDb(root);
  try {
    const orphans = db
      .prepare("SELECT COUNT(*) AS n FROM edges WHERE src_node_id IS NULL")
      .get() as {
      n: number;
    };
    assert.equal(orphans.n, 0, "no edge is stored without an owner");

    db.exec("UPDATE edges SET dst_node_id = NULL");
    const all = resolveEdges(db);
    assert.ok(all.calls > 0 && all.imports > 0, JSON.stringify(all));

    const fileIds = (db.prepare("SELECT id FROM files").all() as Array<{ id: number }>).map(
      (r) => r.id,
    );
    db.exec("UPDATE edges SET dst_node_id = NULL");
    resolveEdges(db, fileIds);
  } finally {
    db.close();
  }
  assert.deepEqual(snapshot(root), full);

  // Re-extract one file's nodes: edges pointing at its old ids dangle until a
  // scoped pass resets and re-resolves them.
  const db2 = openDb(root);
  try {
    const mathId = (
      db2.prepare("SELECT id FROM files WHERE path = 'src/lib/math.ts'").get() as {
        id: number;
      }
    ).id;
    db2.prepare("DELETE FROM nodes WHERE file_id = ?").run(mathId);
    const fresh = Number(
      db2
        .prepare(
          `INSERT INTO nodes(file_id, name, kind, start_line, end_line, start_byte, end_byte)
           VALUES (?, 'add', 'function', 1, 1, 0, 10)`,
        )
        .run(mathId).lastInsertRowid,
    );
    resolveEdges(db2, [mathId]);
    const add = db2
      .prepare(
        `SELECT e.dst_node_id AS dst FROM edges e JOIN files f ON f.id = e.src_file_id
         WHERE e.kind = 'call' AND e.dst_name = 'add' AND f.path = 'src/calc.ts'`,
      )
      .get() as { dst: number };
    assert.equal(add.dst, fresh, "re-pointed at the re-extracted node");
  } finally {
    db2.close();
  }
});

// Covers: req~import-resolution~1
test("imports resolve through relative, multi-line, paths, and baseUrl forms", async (t) => {
  const root = tmpRepo(t);
  seed(root);
  await buildIndex(root);
  const db = openDb(root);
  try {
    const rows = db
      .prepare(
        `SELECT sf.path AS src, df.path AS dst, e.dst_name AS text
         FROM edges e JOIN files sf ON sf.id = e.src_file_id
         LEFT JOIN nodes dn ON dn.id = e.dst_node_id
         LEFT JOIN files df ON df.id = dn.file_id
         WHERE e.kind = 'import' ORDER BY sf.path, e.line`,
      )
      .all() as Array<{ src: string; dst: string | null; text: string }>;
    const to = (src: string): Array<string | null> =>
      rows.filter((r) => r.src === src).map((r) => r.dst);
    assert.deepEqual(to("src/calc.ts"), ["src/lib/math.ts"]);
    assert.equal(
      rows.find((r) => r.src === "src/calc.ts")?.text,
      'import { add, } from "./lib/math.js";',
    );
    assert.deepEqual(to("src/report.ts"), ["src/calc.ts"]);
    assert.deepEqual(to("src/base.ts"), ["src/lib/math.ts"]);
    assert.deepEqual(
      to("test/calc.test.ts"),
      ["src/calc.ts", null],
      "bare packages stay unresolved",
    );
    const builtin = db
      .prepare("SELECT dst_node_id AS dst FROM edges WHERE kind = 'call' AND dst_name = 'test'")
      .get() as { dst: number | null };
    assert.equal(builtin.dst, null);
  } finally {
    db.close();
  }
});

test("stripJsonComments keeps strings and drops comments and trailing commas", () => {
  const text = `{
  // line comment
  "a": "http://x/*not-a-comment*/", /* block */
  "b": [1, 2,],
}`;
  assert.deepEqual(JSON.parse(stripJsonComments(text)), {
    a: "http://x/*not-a-comment*/",
    b: [1, 2],
  });
  assert.equal(stripJsonComments('{"q":"say \\"hi\\" // no"}'), '{"q":"say \\"hi\\" // no"}');
});

test("importBindings lists the local names an import binds", () => {
  assert.deepEqual(importBindings('import fs from "node:fs";', "typescript"), ["fs"]);
  assert.deepEqual(importBindings('import * as path from "node:path";', "typescript"), ["path"]);
  assert.deepEqual(
    importBindings('import React, { useState as useS, type FC } from "react";', "typescript"),
    ["useS", "FC", "React"],
  );
  assert.deepEqual(importBindings('import "./side-effect.js";', "typescript"), []);
  assert.deepEqual(importBindings("import os.path", "python"), ["os"]);
  assert.deepEqual(importBindings("import numpy as np", "python"), ["np"]);
  assert.deepEqual(importBindings("from a.b import (c, d as e)", "python"), ["c", "e"]);
});

// Covers: req~import-resolution~1
test("an import longer than the stored cap still resolves and keeps its bindings", async (t) => {
  const root = tmpRepo(t);
  const names = Array.from({ length: 120 }, (_, i) => `generatedTypeNumber${i}`);
  write(
    root,
    "src/gql/graphql.ts",
    names.map((n) => `export const ${n} = 1;`).join("\n") +
      "\nexport const client = { run(): number { return 1; } };\n",
  );
  write(root, "src/run.ts", "export function run(): number { return 0; }\n");
  write(
    root,
    "src/page.ts",
    `import {\n  ${[...names, "client"].join(",\n  ")},\n} from "./gql/graphql.js";\nexport function page(): number {\n  return client.run();\n}\n`,
  );
  await buildIndex(root);
  const db = openDb(root);
  try {
    const imp = db
      .prepare(
        `SELECT e.dst_name AS text, df.path AS dst
         FROM edges e JOIN files sf ON sf.id = e.src_file_id
         LEFT JOIN nodes dn ON dn.id = e.dst_node_id
         LEFT JOIN files df ON df.id = dn.file_id
         WHERE e.kind = 'import' AND sf.path = 'src/page.ts'`,
      )
      .get() as { text: string; dst: string | null };
    assert.ok(imp.text.length <= 1024, `stored text is capped (${imp.text.length})`);
    assert.match(imp.text, /from "\.\/gql\/graphql\.js";$/, "the from clause is kept");
    assert.equal(imp.dst, "src/gql/graphql.ts", "the long import resolves");
    const call = db
      .prepare("SELECT is_member AS m FROM edges WHERE kind = 'call' AND dst_name = 'run'")
      .get() as { m: number };
    assert.notEqual(call.m, 1, "a binding past the cap is still a known import binding");
  } finally {
    db.close();
  }
});

// Covers: req~impact-id-first~1
test("a global builtin call never binds to a same-named project function", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/runner.ts",
    `export function test(name: string): string { return name; }\nexport function runAll(): string { return test("all"); }\n`,
  );
  write(root, "test/x.test.ts", `test("x", () => {\n  const n = 1;\n  return n;\n});\n`);
  await buildIndex(root);
  const db = openDb(root);
  try {
    const rows = db
      .prepare(
        `SELECT sf.path AS src, df.path AS dst FROM edges e
         JOIN files sf ON sf.id = e.src_file_id
         LEFT JOIN nodes dn ON dn.id = e.dst_node_id
         LEFT JOIN files df ON df.id = dn.file_id
         WHERE e.kind = 'call' AND e.dst_name = 'test' ORDER BY sf.path`,
      )
      .all() as Array<{ src: string; dst: string | null }>;
    assert.deepEqual(
      rows.map((r) => ({ ...r })),
      [
        { src: "src/runner.ts", dst: "src/runner.ts" },
        { src: "test/x.test.ts", dst: null },
      ],
    );
  } finally {
    db.close();
  }

  const ex = explore(root, "test");
  assert.equal(ex.found, true);
  const callerFiles = (ex.callers ?? []).map((c) => c.file);
  assert.ok(callerFiles.includes("src/runner.ts"), "the same-file call is a caller");
  assert.ok(!callerFiles.includes("test/x.test.ts"), JSON.stringify(ex.callers));

  const blast = impact(root, { symbol: "test", format: "flat", edgeKinds: ["call"] });
  const blastFiles = (blast.nodes ?? []).map((n) => n.file);
  assert.ok(!blastFiles.includes("test/x.test.ts"), JSON.stringify(blast.nodes));
});

// Covers: req~impact-id-first~1
test("member calls on a package-namespace receiver are foreign", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/parser.ts", "export function parse(s: string): string { return s; }\n");
  write(
    root,
    "src/use.ts",
    `import path from "node:path";
import _ from "lodash";
import * as local from "./parser.js";
export function pick(p: string): unknown {
  return [path.parse(p), _.parse(p)];
}
export function own(p: string): string {
  return local.parse(p);
}
`,
  );
  await buildIndex(root);
  const ex = explore(root, "parse");
  const callers = (ex.callers ?? []).map((c) => c.name);
  assert.ok(callers.includes("own"), JSON.stringify(ex.callers));
  assert.ok(!callers.includes("pick"), JSON.stringify(ex.callers));
  const db = openDb(root);
  try {
    const rows = db
      .prepare(
        `SELECT e.spec, e.is_member AS m, e.dst_node_id AS dst FROM edges e
         JOIN nodes o ON o.id = e.src_node_id
         WHERE e.kind = 'call' AND e.dst_name = 'parse' AND o.name = 'pick' ORDER BY e.spec`,
      )
      .all() as Array<{ spec: string; m: number; dst: number | null }>;
    assert.deepEqual(
      rows.map((r) => ({ ...r })),
      [
        { spec: "lodash", m: 2, dst: null },
        { spec: "node:path", m: 2, dst: null },
      ],
    );
  } finally {
    db.close();
  }
});

/** Caller names of `name` from explore and from a flat call-edge impact. */
function callersOf(root: string, name: string): { explore: string[]; impact: string[] } {
  const ex = explore(root, name);
  const blast = impact(root, { symbol: name, format: "flat", edgeKinds: ["call"] });
  return {
    explore: (ex.callers ?? []).map((c) => c.name),
    impact: (blast.nodes ?? []).map((n) => n.name),
  };
}

// Covers: req~impact-id-first~1
test("member calls through scoped-looking paths aliases bind to project code", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "tsconfig.json",
    `{ "compilerOptions": { "paths": { "@app/*": ["src/app/*"], "@myorg/core": ["libs/core/src/index.ts"] } } }\n`,
  );
  write(root, "src/app/services/user.ts", "export function getUser(): number { return 1; }\n");
  write(root, "libs/core/src/index.ts", "export function boot(): number { return 2; }\n");
  write(
    root,
    "src/main.ts",
    `import * as svc from "@app/services/user";
import core from "@myorg/core";
export function load(): number {
  return svc.getUser() + core.boot();
}
`,
  );
  write(root, "src/other.ts", "export const other = 1;\n");
  await buildIndex(root);
  for (const name of ["getUser", "boot"]) {
    const got = callersOf(root, name);
    assert.ok(got.explore.includes("load"), `${name}: ${JSON.stringify(got)}`);
    assert.ok(got.impact.includes("load"), `${name}: ${JSON.stringify(got)}`);
  }

  // A scoped pass for an unrelated file still binds the pending member calls of
  // a file whose import that pass resolved.
  const db = openDb(root);
  try {
    db.exec("UPDATE edges SET dst_node_id = NULL");
    const other = db.prepare("SELECT id FROM files WHERE path = 'src/other.ts'").get() as {
      id: number;
    };
    resolveEdges(db, [other.id]);
    const bound = db
      .prepare(
        `SELECT e.dst_name AS name FROM edges e
         WHERE e.kind = 'call' AND e.is_member = 2 AND e.dst_node_id IS NOT NULL ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      bound.map((r) => r.name),
      ["boot", "getUser"],
    );
  } finally {
    db.close();
  }
});

// Covers: req~impact-id-first~1
test("member calls through a single-segment baseUrl module bind to project code", async (t) => {
  const root = tmpRepo(t);
  write(root, "tsconfig.json", `{ "compilerOptions": { "baseUrl": "src" } }\n`);
  write(root, "src/utils.ts", "export function fmt(s: string): string { return s; }\n");
  write(
    root,
    "src/view.ts",
    `import * as utils from "utils";
export function show(): string {
  return utils.fmt("x");
}
`,
  );
  await buildIndex(root);
  const got = callersOf(root, "fmt");
  assert.ok(got.explore.includes("show"), JSON.stringify(got));
  assert.ok(got.impact.includes("show"), JSON.stringify(got));
});

// Covers: req~impact-id-first~1
test("an imported project function named like a builtin keeps its cross-file callers", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/http.ts", "export function fetch(u: string): string { return u; }\n");
  write(
    root,
    "src/client.ts",
    `import { fetch } from "./http.js";
export function go(): string {
  return fetch("u");
}
`,
  );
  write(root, "src/global.ts", `export function raw(): unknown {\n  return fetch("v");\n}\n`);
  await buildIndex(root);
  const got = callersOf(root, "fetch");
  assert.ok(got.explore.includes("go"), JSON.stringify(got));
  assert.ok(got.impact.includes("go"), JSON.stringify(got));
  assert.ok(!got.explore.includes("raw"), "the global fetch stays unbound");
  assert.ok(!got.impact.includes("raw"), JSON.stringify(got));
});

/** Kind and path of the node `src`'s import of `spec` resolved to (null when unresolved). */
function importTargetOf(
  root: string,
  src: string,
  spec: string,
): { kind: string; path: string } | null {
  const db = openDb(root);
  try {
    const row = db
      .prepare(
        `SELECT t.kind AS kind, tf.path AS path FROM edges e
         JOIN files sf ON sf.id = e.src_file_id
         LEFT JOIN nodes t ON t.id = e.dst_node_id
         LEFT JOIN files tf ON tf.id = t.file_id
         WHERE e.kind = 'import' AND sf.path = ? AND e.spec = ?`,
      )
      .get(src, spec) as { kind: string | null; path: string | null } | undefined;
    return row?.kind ? { kind: row.kind, path: row.path! } : null;
  } finally {
    db.close();
  }
}

// Covers: req~impact-id-first~1
// Covers: req~import-resolution~1
test("member calls through an Nx paths alias over a pure re-export barrel bind", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "tsconfig.json",
    `{ "compilerOptions": { "paths": { "@myorg/core": ["libs/core/src/index.ts"] } } }\n`,
  );
  write(root, "libs/core/src/index.ts", `export * from "./lib/core";\n`);
  write(root, "libs/core/src/lib/core.ts", "export function boot(): number { return 2; }\n");
  write(
    root,
    "apps/web/src/main.ts",
    `import * as core from "@myorg/core";
export function load(): number {
  return core.boot();
}
`,
  );
  await buildIndex(root);
  assert.deepEqual(
    importTargetOf(root, "apps/web/src/main.ts", "@myorg/core"),
    { kind: "file", path: "libs/core/src/index.ts" },
    "the barrel import resolves to the barrel's file-owner node",
  );
  const got = callersOf(root, "boot");
  assert.ok(got.explore.includes("load"), JSON.stringify(got));
  assert.ok(got.impact.includes("load"), JSON.stringify(got));
});

// Covers: req~impact-id-first~1
// Covers: req~import-resolution~1
test("member calls through a relative index barrel of re-exports bind", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/api/index.ts", `export * from "./users";\nexport { ping } from "./ping.js";\n`);
  write(root, "src/api/users.ts", "export function listUsers(): number[] { return []; }\n");
  write(root, "src/api/ping.ts", "export function ping(): boolean { return true; }\n");
  write(
    root,
    "src/app.ts",
    `import * as api from "./api";
export function run(): unknown {
  return [api.listUsers(), api.ping()];
}
`,
  );
  await buildIndex(root);
  assert.deepEqual(importTargetOf(root, "src/app.ts", "./api"), {
    kind: "file",
    path: "src/api/index.ts",
  });
  for (const name of ["listUsers", "ping"]) {
    const got = callersOf(root, name);
    assert.ok(got.explore.includes("run"), `${name}: ${JSON.stringify(got)}`);
    assert.ok(got.impact.includes("run"), `${name}: ${JSON.stringify(got)}`);
  }
});

// Covers: req~impact-id-first~1
test("a call through a barrel prefers a definition under the barrel's directory", async (t) => {
  const root = tmpRepo(t);
  // Indexed first, so this unrelated `boot` has the lowest node id.
  write(root, "src/legacy/boot.ts", "export function boot(): number { return 0; }\n");
  await buildIndex(root);
  write(
    root,
    "tsconfig.json",
    `{ "compilerOptions": { "paths": { "@myorg/core": ["libs/core/src/index.ts"] } } }\n`,
  );
  write(root, "libs/core/src/index.ts", `export * from "./lib/core";\n`);
  write(root, "libs/core/src/lib/core.ts", "export function boot(): number { return 2; }\n");
  write(
    root,
    "src/main.ts",
    `import * as core from "@myorg/core";
import { boot } from "@myorg/core";
export function load(): number {
  return core.boot() + boot();
}
`,
  );
  await buildIndex(root);
  const db = openDb(root);
  try {
    const rows = db
      .prepare(
        `SELECT e.is_member AS m, tf.path AS path FROM edges e
         JOIN files sf ON sf.id = e.src_file_id
         LEFT JOIN nodes t ON t.id = e.dst_node_id
         LEFT JOIN files tf ON tf.id = t.file_id
         WHERE e.kind = 'call' AND e.dst_name = 'boot' AND sf.path = 'src/main.ts'
         ORDER BY e.is_member`,
      )
      .all() as Array<{ m: number; path: string | null }>;
    assert.deepEqual(
      rows.map((r) => ({ ...r })),
      [
        { m: 0, path: "libs/core/src/lib/core.ts" },
        { m: 2, path: "libs/core/src/lib/core.ts" },
      ],
    );
  } finally {
    db.close();
  }
});
