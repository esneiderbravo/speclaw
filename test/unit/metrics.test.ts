import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "../../src/modules/compass/extract.js";
import { langForPath } from "../../src/modules/compass/languages.js";
import { tmpRepo, write } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { openDb, SCHEMA_VERSION } from "../../src/modules/compass/db.js";

test("metrics count nested branches and ignore pure arithmetic", async () => {
  const lang = langForPath("x.ts")!;
  const source = `
export function hot(n: number): number {
  if (n > 0) {
    if (n > 1 && n < 10) {
      return n + 1;
    }
  }
  return n * 2 + 3;
}
`;
  const { symbols } = await extract(source, lang);
  const hot = symbols.find((s) => s.name === "hot")!;
  assert.ok(hot.branches > 0, `expected branches > 0, got ${hot.branches}`);
  assert.ok(hot.maxNesting >= 1, `expected nesting >= 1, got ${hot.maxNesting}`);
  assert.equal(hot.loc, hot.endLine - hot.startLine + 1);
});

test("LOC matches definition line span", async () => {
  const lang = langForPath("x.ts")!;
  // lines: 1 blank? we'll count from the function keyword
  const source = `export function ten(): number {
  return 1;
}
`;
  const { symbols } = await extract(source, lang);
  const ten = symbols.find((s) => s.name === "ten")!;
  assert.equal(ten.loc, ten.endLine - ten.startLine + 1);
  assert.equal(ten.loc, 3);
});

test("indexer persists node_metrics under schema 8", async (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "src/m.ts",
    `export function m(x: number): number {
  if (x) { return x; }
  return 0;
}
`,
  );
  await buildIndex(root);
  const db = openDb(root);
  const ver = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
    value: string;
  };
  assert.equal(ver.value, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, "8");
  const row = db
    .prepare(
      `SELECT m.loc, m.max_nesting, m.branches FROM node_metrics m
       JOIN nodes n ON n.id = m.node_id WHERE n.name = 'm'`,
    )
    .get() as { loc: number; max_nesting: number; branches: number };
  db.close();
  assert.ok(row);
  assert.ok(row.loc >= 3);
  assert.ok(row.branches >= 1);
});
