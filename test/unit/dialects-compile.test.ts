import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import {
  parseLawsFromMarkdown,
  parseLawsFromStandards,
} from "../../src/modules/foundation/laws-parse.js";
import { compileLaws, estimateAlwaysOnTokens } from "../../src/modules/foundation/compile-laws.js";
import { importRulesFrom } from "../../src/modules/foundation/import-rules.js";
import { writeLawManifest, seedManifest } from "../../src/modules/foundation/laws.js";
import { verifyLaws } from "../../src/modules/foundation/verify.js";
import { frontmatter, patchDelimited } from "../../src/modules/foundation/dialects/index.js";

test("parseLawsFromMarkdown reads speclaw:law blocks", () => {
  const md = `# Std

<!-- speclaw:law
id: law~demo~1
title: Demo
severity: error
scope: src/**/*.ts
enforcement: gate
verification: semantic
-->
Never invent APIs.

## Next
`;
  const laws = parseLawsFromMarkdown("docs/standards/x.md", md);
  assert.equal(laws.length, 1);
  assert.equal(laws[0]!.id, "law~demo~1");
  assert.deepEqual(laws[0]!.scope, ["src/**/*.ts"]);
  assert.match(laws[0]!.prose, /Never invent/);
});

test("parseLawsFromStandards fails duplicates via result.duplicates", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "docs/standards/a.md",
    `<!-- speclaw:law\nid: law~dup~1\ntitle: A\nseverity: warn\nscope:\nenforcement: feedback\nverification: semantic\n-->\nA\n`,
  );
  write(
    root,
    "docs/standards/b.md",
    `<!-- speclaw:law\nid: law~dup~1\ntitle: B\nseverity: warn\nscope:\nenforcement: feedback\nverification: semantic\n-->\nB\n`,
  );
  const r = parseLawsFromStandards(root);
  assert.equal(r.duplicates.size, 1);
  assert.ok(r.duplicates.get("law~dup~1")!.length >= 2);
});

test("patchDelimited preserves surrounding text", () => {
  const prev = "# Title\n\nkeep me\n";
  const next = patchDelimited(prev, "laws", "## generated\n");
  assert.match(next, /keep me/);
  assert.match(next, /speclaw:laws:start/);
  const again = patchDelimited(next, "laws", "## generated v2\n");
  assert.equal((again.match(/speclaw:laws:start/g) ?? []).length, 1);
  assert.match(again, /v2/);
});

test("frontmatter emits paths and globs", () => {
  assert.match(frontmatter({ paths: ["src/**"] }), /paths:/);
  assert.match(frontmatter({ alwaysApply: true }), /alwaysApply: true/);
});

test("compileLaws is idempotent and writes claude/cursor rules", async (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "# Agents\n");
  write(root, "CLAUDE.md", "# Claude\n");
  writeLawManifest(root, seedManifest());
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(root, ".cursor"), { recursive: true });

  const first = compileLaws({ projectPath: root, agents: ["claude", "cursor"] });
  assert.ok(first.written.length > 0);
  const second = compileLaws({ projectPath: root, agents: ["claude", "cursor"] });
  assert.equal(second.written.length, 0);
  assert.ok(second.unchanged.length > 0);

  const rulesDir = path.join(root, "ai-specs", "rules");
  assert.ok(fs.existsSync(rulesDir));
  const files = fs.readdirSync(rulesDir);
  assert.ok(files.some((f) => f.endsWith(".md")));
  assert.ok(files.some((f) => f.endsWith(".mdc")));
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /speclaw:laws:start/);
});

test("import rulesync creates draft laws that do not fail verify", (t) => {
  const root = tmpRepo(t);
  write(root, ".rulesync/no-foo.md", "Do not use foo.\n");
  writeLawManifest(root, { version: 1, laws: [] });
  const imp = importRulesFrom(root, "rulesync");
  assert.equal(imp.imported.length, 1);
  const report = verifyLaws({ projectPath: root });
  assert.equal(report.summary.failed, 0);
  assert.ok(report.skipped.some((s) => s.reason === "draft"));
});

test("estimateAlwaysOnTokens ranks empty-scope laws", () => {
  const { total, top } = estimateAlwaysOnTokens([
    {
      id: "law~a~1",
      title: "A",
      severity: "warn",
      scope: [],
      prose: "x".repeat(100),
      verification: { kind: "semantic" },
      enforcement: "feedback",
      source: { file: "a.md" },
    },
    {
      id: "law~b~1",
      title: "B",
      severity: "warn",
      scope: ["src/**"],
      prose: "scoped",
      verification: { kind: "path" },
      enforcement: "feedback",
      source: { file: "b.md" },
    },
  ]);
  assert.ok(total > 0);
  assert.equal(top[0]!.id, "law~a~1");
});

test("compileLaws throws on duplicate standard ids", (t) => {
  const root = tmpRepo(t);
  write(
    root,
    "docs/standards/a.md",
    `<!-- speclaw:law\nid: law~dup~1\ntitle: A\nseverity: warn\nscope:\nenforcement: feedback\nverification: semantic\n-->\nA\n`,
  );
  write(
    root,
    "docs/standards/b.md",
    `<!-- speclaw:law\nid: law~dup~1\ntitle: B\nseverity: warn\nscope:\nenforcement: feedback\nverification: semantic\n-->\nB\n`,
  );
  assert.throws(() => compileLaws({ projectPath: root, agents: [] }), /duplicate law id/);
});

test("compileLaws emits copilot instructions and coderabbit merge", (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "# A\n");
  write(root, ".coderabbit.yaml", "language: en-US\nreviews:\n  auto_review:\n    enabled: true\n");
  writeLawManifest(root, {
    version: 1,
    laws: [
      {
        id: "law~scoped~1",
        title: "Scoped",
        severity: "warn",
        scope: ["src/**/*.ts"],
        prose: "Scoped prose",
        verification: { kind: "semantic" },
        enforcement: "feedback",
        source: { file: "docs/standards/x.md", line: 1 },
      },
    ],
  });
  const report = compileLaws({
    projectPath: root,
    agents: ["agents", "coderabbit", "copilot"],
  });
  assert.ok(report.failed.length === 0);
  const instr = path.join(root, ".github", "instructions");
  assert.ok(fs.existsSync(instr));
  const cr = fs.readFileSync(path.join(root, ".coderabbit.yaml"), "utf8");
  assert.match(cr, /language: en-US/);
  assert.match(cr, /speclaw:path_instructions:start/);
  assert.match(cr, /speclaw:law~scoped~1/);
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /src\/\*\*\/\*\.ts/);
});

test("import rejects unknown from", () => {
  assert.throws(() => importRulesFrom(process.cwd(), "nope"), /unsupported import source/);
});

test("nested AGENTS when package.json and enough laws", (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "# root\n");
  write(root, "packages/api/package.json", `{"name":"api"}\n`);
  const laws = [1, 2, 3].map((n) => ({
    id: `law~api-${n}~1`,
    title: `Api ${n}`,
    severity: "warn" as const,
    scope: [`packages/api/**`],
    prose: `Rule ${n}`,
    verification: { kind: "semantic" as const },
    enforcement: "feedback" as const,
    source: { file: "docs/standards/a.md", line: n },
  }));
  writeLawManifest(root, { version: 1, laws });
  compileLaws({ projectPath: root, agents: ["agents"] });
  assert.ok(fs.existsSync(path.join(root, "packages", "api", "AGENTS.md")));
});
