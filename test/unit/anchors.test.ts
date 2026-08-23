import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write, has } from "../helpers/env.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import {
  extractCandidates,
  sealCapability,
  readAnchorsFile,
} from "../../src/modules/lawbook/anchors.js";

test("extractCandidates finds backticks, paths, and casing tokens", () => {
  const cands = extractCandidates(`### Requirement: Demo

Call \`uniqueFn\` and also CamelCaseGhost in prose.

#### Scenario: ok
- path \`src/util.ts\`
`);
  assert.ok(cands.some((c) => c.text === "uniqueFn" && c.source === "backtick"));
  assert.ok(cands.some((c) => c.text === "src/util.ts" && c.source === "path"));
  assert.ok(cands.some((c) => c.source === "casing" && c.text === "CamelCaseGhost"));
});

test("extractCandidates records unresolved backticks for orphan sealing", () => {
  const cands = extractCandidates(`### Requirement: X\n\nUses \`missingFn\`.\n`);
  assert.ok(cands.some((c) => c.text === "missingFn" && c.source === "backtick"));
});

test("sealCapability writes committed JSON and warns when empty", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/util.ts", `export function helper(): number { return 1; }\n`);
  await buildIndex(root);

  const empty = sealCapability(root, "empty", `### Requirement: Blank\n\nNo symbols.\n`);
  assert.equal(empty.warned, true);
  assert.equal(empty.unique, 0);
  assert.ok(has(root, "lawbook/anchors/empty.json"));

  const sealed = sealCapability(root, "demo", `### Requirement: Helper\n\nUses \`helper\`.\n`);
  assert.equal(sealed.warned, false);
  assert.equal(sealed.unique, 1);
  const file = readAnchorsFile(root, "demo");
  assert.ok(file);
  assert.equal(file!.anchors[0]!.resolution, "unique");
  assert.ok(file!.anchors[0]!.contentHash);
  assert.ok(file!.anchors[0]!.rawHash);

  // Unresolved casing is dropped at resolve/seal time.
  const casingOnly = sealCapability(
    root,
    "casing",
    `### Requirement: Ghost\n\nMentions CamelCaseGhost only.\n`,
  );
  assert.equal(casingOnly.unique, 0);
  assert.equal(casingOnly.unresolved, 0);
  assert.equal(casingOnly.ambiguous, 0);
});
