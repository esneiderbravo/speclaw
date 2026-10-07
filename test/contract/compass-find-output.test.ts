// Covers: req~find-response-budget~1
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { gitInit, commit } from "../helpers/git.js";
import { captureTools, isTextResult } from "../helpers/contracts.js";
import { registerCompass } from "../../src/modules/compass/register.js";
import { estimateTokens, OUTPUT_BUDGET } from "../../src/shared/output-budget.js";

const HIT_KEYS = ["file", "kind", "line", "name"];

/** A fixture with 48 documented functions that all match "handle request". */
function seedManyFunctions(root: string): void {
  for (let i = 0; i < 48; i++) {
    write(
      root,
      `src/handlers/request${i}.ts`,
      `/** Handle the incoming request number ${i} and return a normalised response body. */\n` +
        `export function handleRequest${i}(input: string, retries: number): string {\n` +
        `  return input.repeat(retries) + "${i}";\n}\n`,
    );
  }
}

/** Registered Compass tools over an indexed fixture (aliases optional). */
async function indexedTools(root: string, aliases = false) {
  if (aliases) delete process.env.SPECLAW_NO_ALIASES;
  else process.env.SPECLAW_NO_ALIASES = "1";
  const tools = captureTools(registerCompass);
  delete process.env.SPECLAW_NO_ALIASES;
  await tools.get("compass_index")!.handler({ projectPath: root });
  return tools;
}

function textOf(result: unknown): string {
  assert.ok(isTextResult(result));
  return result.content[0]!.text;
}

test("compass_find response fits maxTokens and stays valid JSON", async (t) => {
  const root = tmpRepo(t);
  seedManyFunctions(root);
  const tools = await indexedTools(root);
  for (const maxTokens of [2000, 8000]) {
    const raw = textOf(
      await tools.get("compass_find")!.handler({
        projectPath: root,
        query: "handle request",
        mode: "concept",
        maxTokens,
      }),
    );
    assert.ok(!raw.includes("[truncated"), `maxTokens ${maxTokens}: ${raw.slice(-160)}`);
    const body = JSON.parse(raw) as Record<string, unknown>;
    assert.ok(estimateTokens(raw) <= maxTokens, `${estimateTokens(raw)} > ${maxTokens}`);
    assert.equal(body.tokens, estimateTokens(raw));
    assert.equal(body.budget, maxTokens);
    const hits = body.hits as Array<Record<string, unknown>>;
    assert.ok(hits.length > 0);
    for (const h of hits) assert.deepEqual(Object.keys(h).sort(), HIT_KEYS);
    for (const k of ["route", "signals", "nodeId", "signature"]) {
      assert.ok(!raw.includes(`"${k}"`), `response carries ${k}`);
    }
  }
});

test("compass_find without maxTokens fits the brief ceiling", async (t) => {
  const root = tmpRepo(t);
  seedManyFunctions(root);
  const tools = await indexedTools(root);
  const raw = textOf(
    await tools.get("compass_find")!.handler({
      projectPath: root,
      query: "handle request",
      mode: "concept",
    }),
  );
  const body = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(body.budget, OUTPUT_BUDGET.brief);
  assert.ok(estimateTokens(raw) <= OUTPUT_BUDGET.brief);
  assert.equal(body.tokens, estimateTokens(raw));
});

test("compass_find reports truncated only when it trimmed", async (t) => {
  const root = tmpRepo(t);
  seedManyFunctions(root);
  const tools = await indexedTools(root);
  const fits = textOf(
    await tools.get("compass_find")!.handler({
      projectPath: root,
      query: "handleRequest7",
      mode: "exact",
    }),
  );
  const fitBody = JSON.parse(fits) as Record<string, unknown>;
  assert.equal("truncated" in fitBody, false, fits);
  assert.equal(fitBody.found, true);

  const tight = textOf(
    await tools.get("compass_find")!.handler({
      projectPath: root,
      query: "handle request",
      mode: "concept",
      maxTokens: 256,
    }),
  );
  const tightBody = JSON.parse(tight) as Record<string, unknown>;
  assert.equal(tightBody.truncated, true);
  assert.ok((tightBody.hits as unknown[]).length >= 1);
  assert.ok(estimateTokens(tight) <= 256);
  assert.equal(tightBody.tokens, estimateTokens(tight));
});

test("compass_search alias uses the same compact shape", async (t) => {
  const root = tmpRepo(t);
  seedManyFunctions(root);
  const tools = await indexedTools(root, true);
  const viaFind = JSON.parse(
    textOf(
      await tools.get("compass_find")!.handler({
        projectPath: root,
        query: "handleRequest3",
        mode: "exact",
      }),
    ),
  ) as Record<string, unknown>;
  const aliasText = textOf(
    await tools.get("compass_search")!.handler({ projectPath: root, query: "handleRequest3" }),
  );
  assert.match(aliasText, /^\[deprecated\]/);
  assert.ok(estimateTokens(aliasText) <= OUTPUT_BUDGET.brief);
  const alias = JSON.parse(aliasText.slice(aliasText.indexOf("{"))) as Record<string, unknown>;
  assert.deepEqual(Object.keys(alias).sort(), Object.keys(viaFind).sort());
  for (const h of alias.hits as Array<Record<string, unknown>>) {
    assert.deepEqual(Object.keys(h).sort(), HIT_KEYS);
  }
  assert.equal(alias.mode, "exact");
  assert.deepEqual(alias.terms, ["handleRequest3"]);
});

/**
 * A git fixture whose working tree has many changes: 30 committed-then-modified
 * indexed files and 30 untracked non-code files. With no explicit `focus`,
 * `focus` and `focusIgnored` alone outgrow a 256-token cap.
 */
function seedChangedWorktree(root: string): void {
  gitInit(root);
  const files = [{ path: ".gitignore", content: ".speclaw/\n" }];
  for (let i = 0; i < 30; i++) {
    files.push({
      path: `src/features/billing-module-${i}/request-handler.ts`,
      content: `export function handleRequest${i}(input: string): string {\n  return input + "${i}";\n}\n`,
    });
  }
  commit(root, "seed", files);
  for (let i = 0; i < 30; i++) {
    write(
      root,
      `src/features/billing-module-${i}/request-handler.ts`,
      `export function handleRequest${i}(input: string): string {\n  return input.trim() + "${i}";\n}\n`,
    );
    write(root, `notes/untracked-design-notes-${i}.txt`, `note ${i}\n`);
  }
}

/** Assert the raw text is one valid JSON document within `cap` with exact `tokens`. */
function assertFits(raw: string, cap: number): Record<string, unknown> {
  assert.ok(!raw.includes("[truncated"), raw.slice(-160));
  const body = JSON.parse(raw) as Record<string, unknown>;
  assert.ok(estimateTokens(raw) <= cap, `${estimateTokens(raw)} > ${cap}`);
  assert.equal(body.tokens, estimateTokens(raw));
  assert.equal(body.budget, cap);
  return body;
}

// Covers: req~find-response-budget~1
test("compass_find fits a 256-token cap over a worktree with many changes", async (t) => {
  const root = tmpRepo(t);
  seedChangedWorktree(root);
  const tools = await indexedTools(root);
  const raw = textOf(
    await tools.get("compass_find")!.handler({
      projectPath: root,
      query: "handle request",
      mode: "concept",
      maxTokens: 256,
    }),
  );
  const body = assertFits(raw, 256);
  assert.equal(body.truncated, true);
  assert.ok(typeof body.focusTotal === "number" && body.focusTotal >= 30, raw);
  assert.ok((body.focus as unknown[]).length < (body.focusTotal as number), raw);
  // The context lists go before the payload: more than one hit survives.
  assert.ok((body.hits as unknown[]).length > 1, raw);
});

// Covers: req~find-response-budget~1
test("compass_find fits a 256-token cap with a long exact-mode query", async (t) => {
  const root = tmpRepo(t);
  seedManyFunctions(root);
  const tools = await indexedTools(root);
  const terms = Array.from({ length: 60 }, (_, i) => `missingIdentifierNumber${i}`);
  const raw = textOf(
    await tools.get("compass_find")!.handler({
      projectPath: root,
      query: terms.join(" "),
      mode: "exact",
      maxTokens: 256,
    }),
  );
  const body = assertFits(raw, 256);
  assert.equal(body.truncated, true);
  assert.equal(body.termsTotal, 60);
  assert.ok((body.terms as unknown[]).length < 60);
});
