import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import {
  logDeprecatedCall,
  prefixDeprecated,
  readDeprecatedCallCounts,
  scanRetiredToolReferences,
} from "../../src/shared/deprecation.js";

test("prefixDeprecated names the canonical replacement", () => {
  const out = prefixDeprecated("compass_search", "{}");
  assert.match(out, /\[deprecated\]/);
  assert.match(out, /compass_find/);
});

test("logDeprecatedCall appends to deprecated-calls.jsonl", (t) => {
  const root = tmpRepo(t);
  logDeprecatedCall(root, "compass_search");
  logDeprecatedCall(root, "compass_search");
  const counts = readDeprecatedCallCounts(root);
  assert.equal(counts.get("compass_search"), 2);
  const log = fs.readFileSync(path.join(root, ".speclaw", "deprecated-calls.jsonl"), "utf8");
  assert.equal(log.trim().split("\n").length, 2);
});

test("scanRetiredToolReferences finds alias names in agent entry files", (t) => {
  const root = tmpRepo(t);
  write(root, "CLAUDE.md", "Use compass_search before grep.\n");
  const hits = scanRetiredToolReferences(root);
  assert.ok(hits.some((h) => h.alias === "compass_search"));
});
