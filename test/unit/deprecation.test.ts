import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { scanRetiredToolReferences } from "../../src/shared/deprecation.js";

test("scanRetiredToolReferences finds alias names in agent entry files", (t) => {
  const root = tmpRepo(t);
  write(root, "CLAUDE.md", "Use compass_search before grep.\n");
  const hits = scanRetiredToolReferences(root);
  assert.ok(hits.some((h) => h.alias === "compass_search"));
});

test("scanRetiredToolReferences finds retired names in generated skills", (t) => {
  const root = tmpRepo(t);
  write(root, "ai-specs/skills/archive/SKILL.md", "Call lawbook_archive when done.\n");
  const hits = scanRetiredToolReferences(root);
  assert.ok(
    hits.some((h) => h.alias === "lawbook_archive" && h.replacement.includes("lawbook_change")),
  );
});
