import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { hybridSearch } from "../../src/modules/compass/hybrid.js";
import { search } from "../../src/modules/compass/query.js";
import { openDb } from "../../src/modules/compass/db.js";
import { findSymbols } from "../../src/modules/compass/explore-rich.js";
import { defaultBudget } from "../../src/modules/compass/budget.js";
import { gitInit, commit } from "../helpers/git.js";

/** Build a small fixture with known symbols for MRR evaluation. */
function writeFixture(root: string): Array<{ query: string; expect: string }> {
  const pairs: Array<{ query: string; expect: string }> = [];
  const files: Array<[string, string]> = [];

  for (let i = 0; i < 20; i++) {
    const name = `getItem${i}`;
    files.push([
      `src/get${i}.ts`,
      `/** fetch item ${i} from store */\nexport function ${name}(id: string) { return id; }\n`,
    ]);
    pairs.push({ query: name, expect: name });
    pairs.push({ query: `fetch item ${i}`, expect: name });
  }
  for (let i = 0; i < 10; i++) {
    const name = `validateToken${i}`;
    files.push([
      `src/auth${i}.ts`,
      `/** validate the session token ${i} */\nexport function ${name}(t: string) { return t.length > 0; }\n`,
    ]);
    pairs.push({ query: name, expect: name });
    pairs.push({ query: `validate session token ${i}`, expect: name });
  }

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  for (const [rel, body] of files) {
    fs.writeFileSync(path.join(root, rel), body);
  }
  return pairs;
}

function mrrAt10(rankedNames: string[], expect: string): number {
  const idx = rankedNames.slice(0, 10).indexOf(expect);
  return idx < 0 ? 0 : 1 / (idx + 1);
}

test("hybrid MRR@10 beats or matches LIKE baseline on golden fixture", async (t) => {
  const root = tmpRepo(t);
  const pairs = writeFixture(root);
  assert.ok(pairs.length >= 40);
  await buildIndex(root);

  let likeMrr = 0;
  let hybridMrr = 0;
  const latencies: number[] = [];

  for (const { query, expect } of pairs) {
    const like = search(root, query, 10).map((h) => h.name);
    likeMrr += mrrAt10(like, expect);

    const t0 = performance.now();
    const hy = await hybridSearch(root, query, { maxTokens: 4096, seedLimit: 50 });
    latencies.push(performance.now() - t0);
    hybridMrr += mrrAt10(
      hy.hits.map((h) => h.name),
      expect,
    );
  }

  likeMrr /= pairs.length;
  hybridMrr /= pairs.length;
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

  assert.ok(
    hybridMrr + 1e-9 >= likeMrr * 0.95,
    `hybrid MRR@10 ${hybridMrr.toFixed(3)} should be >= ~95% of LIKE ${likeMrr.toFixed(3)}`,
  );
  assert.ok(hybridMrr >= 0.35, `hybrid MRR@10 too low: ${hybridMrr}`);
  assert.ok(
    p95 < 500,
    `p95 latency ${p95.toFixed(1)}ms exceeds 500ms soft budget on small fixture`,
  );

  const db = openDb(root);
  t.after(() => db.close());
  const docs = db.prepare("SELECT COUNT(*) AS c FROM node_text WHERE doc != ''").get() as {
    c: number;
  };
  assert.ok(docs.c > 0, "docstrings should be indexed");
});

/** Shape of the find result the MCP formatter reads (`findSymbols`). */
interface FindShape {
  focus: string[];
  focusIgnored?: string[];
  budget: number;
  rendered: string;
  hits: Array<{ name: string; kind: string; file: string; line: number }>;
  found?: boolean;
  terms?: string[];
  nearest?: Array<{ name: string; kind: string; file: string; line: number }>;
}

// Covers: req~task-relative-ranking~1
test("worktree focus excludes unindexed files", async (t) => {
  const root = tmpRepo(t);
  gitInit(root);
  commit(root, "seed", [
    { path: ".gitignore", content: ".speclaw/\n" },
    { path: "src/a.ts", content: "export function alpha(): number { return 1; }\n" },
    { path: "notes.md", content: "# notes\n" },
  ]);
  await buildIndex(root);
  fs.writeFileSync(path.join(root, "src/a.ts"), "export function alpha(): number { return 2; }\n");
  fs.writeFileSync(path.join(root, "notes.md"), "# notes\n\nmore\n");

  const r = (await findSymbols(root, "alpha", "concept")) as FindShape;
  assert.deepEqual(r.focus, ["src/a.ts"]);
  assert.deepEqual(r.focusIgnored, ["notes.md"]);
});

// Covers: req~task-relative-ranking~1
test("explicit unindexed focus falls back to no-focus defaults", async (t) => {
  const root = tmpRepo(t);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/a.ts"), "export function alpha(): number { return 1; }\n");
  await buildIndex(root);

  const cli = await hybridSearch(root, "alpha", { focus: ["notes.md"] });
  const none = await hybridSearch(root, "alpha", {});
  assert.deepEqual(cli.focus, []);
  assert.equal(cli.budget, defaultBudget(false));
  assert.equal(cli.budget, none.budget);
  assert.deepEqual(
    cli.hits.map((h) => [h.name, h.signals.pagerank]),
    none.hits.map((h) => [h.name, h.signals.pagerank]),
    "personalization equals the no-focus call",
  );

  const mcp = (await findSymbols(root, "alpha", "concept", undefined, {
    focus: ["notes.md", "./src/a.ts"],
  })) as FindShape;
  assert.deepEqual(mcp.focus, ["src/a.ts"], "normalised indexed focus is kept");
  assert.deepEqual(mcp.focusIgnored, ["notes.md"]);
});

/** A fixture defining RequestDetail, alpha, and beta in separate files. */
async function seedExactFixture(root: string): Promise<void> {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src/detail.ts"),
    "export function RequestDetail(id: string): string { return id; }\n",
  );
  fs.writeFileSync(
    path.join(root, "src/alpha.ts"),
    "export function alpha(): number { return 1; }\n",
  );
  fs.writeFileSync(
    path.join(root, "src/beta.ts"),
    "export function beta(): number { return 2; }\n",
  );
  await buildIndex(root);
}

// Covers: req~find-exact-not-found~1
test("exact find for a missing name reports not found with nearest", async (t) => {
  const root = tmpRepo(t);
  await seedExactFixture(root);
  const r = (await findSymbols(root, "RequestDetailScreen", "exact")) as FindShape;
  assert.equal(r.found, false);
  assert.deepEqual(r.hits, []);
  assert.equal(r.rendered, "");
  assert.deepEqual(r.terms, ["RequestDetailScreen"]);
  assert.ok(r.nearest && r.nearest.length >= 1 && r.nearest.length <= 5);
  assert.equal(r.nearest[0]!.name, "RequestDetail");
  assert.deepEqual(Object.keys(r.nearest[0]!).sort(), ["file", "kind", "line", "name"]);

  const hit = (await findSymbols(root, "alpha", "exact")) as FindShape;
  assert.equal(hit.found, true);
  assert.ok(hit.hits.length >= 1);
  assert.ok(hit.hits.every((h) => h.name === "alpha"));
  assert.equal("nearest" in hit, false);
});

// Covers: req~find-exact-not-found~1
test("multi-term exact query ORs identifiers", async (t) => {
  const root = tmpRepo(t);
  await seedExactFixture(root);
  const r = (await findSymbols(root, "alpha beta", "exact")) as FindShape;
  assert.deepEqual(r.terms, ["alpha", "beta"]);
  assert.equal(r.found, true);
  const names = new Set(r.hits.map((h) => h.name));
  assert.ok(names.has("alpha") && names.has("beta"), JSON.stringify(r.hits));
  assert.ok(r.hits.every((h) => h.name === "alpha" || h.name === "beta"));

  const concept = (await findSymbols(root, "RequestDetailScreen", "concept")) as FindShape;
  assert.equal("found" in concept, false);
  assert.equal("nearest" in concept, false);
  assert.equal("terms" in concept, false);
});
