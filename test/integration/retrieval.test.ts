import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { hybridSearch } from "../../src/modules/compass/hybrid.js";
import { search } from "../../src/modules/compass/query.js";
import { openDb } from "../../src/modules/compass/db.js";

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
