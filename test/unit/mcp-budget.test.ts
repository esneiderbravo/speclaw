import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { tmpRepo, write } from "../helpers/env.js";
import { defineTool, text } from "../../src/shared/mcp.js";
import { MAP_END, MAP_START, writeCompactMap } from "../../src/modules/compass/map.js";
import { buildIndex } from "../../src/modules/compass/indexer.js";
import { writeManifest, readManifest } from "../../src/shared/manifest.js";
import { collectRegisteredTools } from "../../src/modules/foundation/context-budget.js";
import { countWords } from "../../src/shared/tokens.js";
import { estimateTokens } from "../../src/shared/tokens.js";

test("defineTool throws when description exceeds the word cap", () => {
  const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
  const server = {
    registerTool() {
      throw new Error("should not register");
    },
  } as unknown as McpServer;
  assert.throws(
    () =>
      defineTool(server, {
        name: "too_long",
        description: words,
        inputSchema: {},
        handler: async () => text({}),
      }),
    /words/,
  );
});

test("defineTool throws when definition tokens exceed the per-tool cap", () => {
  const server = {
    registerTool() {
      throw new Error("should not register");
    },
  } as unknown as McpServer;
  const fat: Record<string, z.ZodTypeAny> = {};
  for (let i = 0; i < 80; i++) fat[`field${i}`] = z.string();
  assert.throws(
    () =>
      defineTool(server, {
        name: "fat_tool",
        description: "A short description under the word cap.",
        inputSchema: fat,
        handler: async () => text({}),
      }),
    /tokens exceeds/,
  );
});

test("all registered tool descriptions are ≤ 25 words", () => {
  for (const t of collectRegisteredTools(false)) {
    const n = countWords(t.description);
    assert.ok(n <= 25, `${t.name} has ${n} words: ${t.description}`);
  }
});

test("minimal registration omits the omit-set", () => {
  const names = new Set(collectRegisteredTools(true).map((t) => t.name));
  assert.ok(!names.has("compass_index"));
  assert.ok(!names.has("init_project"));
  assert.ok(!names.has("lawbook_level"));
  assert.ok(names.has("compass_explore"));
  assert.ok(names.has("speclaw_check"));
});

test("manifest persists minimal across write without the flag", (t) => {
  const root = tmpRepo(t);
  fs.mkdirSync(path.join(root, "ai-specs"), { recursive: true });
  writeManifest(root, "0.3.4", ["agents"], {}, { minimal: true });
  assert.equal(readManifest(root)?.minimal, true);
  writeManifest(root, "0.3.5", ["agents"], {});
  assert.equal(readManifest(root)?.minimal, true);
});

test("compact map regenerates between markers and preserves outside content", async (t) => {
  const root = tmpRepo(t);
  write(root, "src/a.ts", "export function alpha() { return 1; }\n");
  write(root, "src/b.ts", "import { alpha } from './a.js';\nalpha();\nexport function beta() {}\n");
  const before = `# Compass\n\nintro\n\n${MAP_START}\nOLD\n${MAP_END}\n\nfooter\n`;
  write(root, "docs/compass.md", before);
  await buildIndex(root);
  const after = fs.readFileSync(path.join(root, "docs/compass.md"), "utf8");
  assert.ok(after.startsWith("# Compass"));
  assert.ok(after.includes("footer"));
  assert.ok(after.includes(MAP_START));
  assert.ok(after.includes(MAP_END));
  assert.ok(!after.includes("OLD"));
  assert.ok(estimateTokens(after.slice(after.indexOf(MAP_START), after.indexOf(MAP_END))) <= 300);
});

test("missing markers does not insert a map", (t) => {
  const root = tmpRepo(t);
  write(root, "docs/compass.md", "# no markers\n");
  const result = writeCompactMap(root);
  assert.equal(result.written, false);
  assert.match(result.reason ?? "", /markers missing/);
  assert.equal(fs.readFileSync(path.join(root, "docs/compass.md"), "utf8"), "# no markers\n");
});
