/**
 * Static affected-test selection: reverse reachability into `files.is_test = 1`,
 * plus a ready-to-run command string.
 */

import fs from "node:fs";
import path from "node:path";
import { changedFiles, isGitRepo } from "../../shared/git.js";
import { openDb, indexExists } from "./db.js";
import { impact, type ImpactQuery } from "./query.js";
import {
  loadAffectedConfig,
  matchGlobalFiles,
  matchesAny,
  type AffectedConfig,
} from "./affected-config.js";

/** One selected test file in an {@link AffectedTestsResult}. */
export interface AffectedTestFile {
  file: string;
  nodes: number;
  minDepth: number;
}

/** Result of {@link affectedTests}. */
export interface AffectedTestsResult {
  mode: "static" | "all";
  reason: string;
  tests: AffectedTestFile[];
  skipped: { files: number; percent: number };
  command: string;
  warnings: string[];
}

/** Inputs for {@link affectedTests}. */
export interface AffectedTestsQuery {
  files?: string[];
  symbols?: string[];
  fromDiff?: string;
  maxDepth?: number;
}

/**
 * Select a safe superset of test files affected by a change.
 *
 * @param projectPath - Absolute project root with a Compass index.
 * @param query - Files, symbols, and/or a git diff base ref.
 */
export function affectedTests(
  projectPath: string,
  query: AffectedTestsQuery = {},
): AffectedTestsResult {
  if (!indexExists(projectPath)) {
    throw new Error(
      "No index found. Build it first with the index_build tool (creates .speclaw/index.db).",
    );
  }

  const cfg = loadAffectedConfig(projectPath);
  const warnings: string[] = [];
  warnings.push(...warnUnindexedLanguages(projectPath));

  let files = [...(query.files ?? [])];
  if (query.fromDiff !== undefined) {
    if (!isGitRepo(projectPath)) {
      throw new Error("fromDiff requires a git repository");
    }
    const base = query.fromDiff === "WORKTREE" || query.fromDiff === "" ? "HEAD" : query.fromDiff;
    // WORKTREE ≈ uncommitted: use merge-base against HEAD's first-parent via changedFiles("HEAD")
    // when the caller passes a branch/ref; for literal WORKTREE fall back to HEAD...working tree
    // is not in changedFiles — use the ref as merge-base target.
    const diffFiles =
      query.fromDiff === "WORKTREE"
        ? listWorktreeChanges(projectPath)
        : changedFiles(projectPath, base);
    files = [...new Set([...files, ...diffFiles])];
    if (files.length === 0) {
      return {
        mode: "static",
        reason: "no changed files",
        tests: [],
        skipped: { files: countTestFiles(projectPath), percent: 100 },
        command: buildTestCommand(projectPath, [], cfg, "none"),
        warnings,
      };
    }
  }

  const glob = matchGlobalFiles(files, cfg);
  if (glob.matched.length > 0) {
    const allTests = listTestFiles(projectPath);
    return {
      mode: "all",
      reason: `global file matched (${glob.matched.join(", ")})`,
      tests: allTests.map((file) => ({ file, nodes: 0, minDepth: 0 })),
      skipped: { files: 0, percent: 0 },
      command: buildTestCommand(projectPath, [], cfg, "all"),
      warnings,
    };
  }

  const impactOpts: ImpactQuery = {
    files: files.length > 0 ? files : undefined,
    symbol: query.symbols?.length === 1 ? query.symbols[0] : undefined,
    maxDepth: query.maxDepth ?? 6,
    format: "flat",
    target: "test",
    edgeKinds: ["call", "import"],
  };

  // Multiple symbols → union flat impacts.
  const nodes = [...(impact(projectPath, impactOpts).nodes ?? [])];
  if (query.symbols && query.symbols.length > 1) {
    const seen = new Set(nodes.map((n) => n.nodeId));
    for (const sym of query.symbols) {
      for (const n of impact(projectPath, {
        symbol: sym,
        format: "flat",
        maxDepth: impactOpts.maxDepth,
      }).nodes ?? []) {
        if (!seen.has(n.nodeId)) {
          seen.add(n.nodeId);
          nodes.push(n);
        }
      }
    }
  }

  // Also include directly changed test files.
  const testHits = new Map<string, AffectedTestFile>();
  for (const f of files) {
    const norm = f.split("\\").join("/");
    if (matchesAny(norm, cfg.testGlobs)) {
      testHits.set(norm, { file: norm, nodes: 0, minDepth: 0 });
    }
  }

  const db = openDb(projectPath);
  try {
    const isTestByPath = new Map<string, boolean>();
    for (const row of db.prepare("SELECT path, is_test FROM files").all() as Array<{
      path: string;
      is_test: number;
    }>) {
      isTestByPath.set(row.path, row.is_test === 1);
    }

    for (const n of nodes) {
      if (!isTestByPath.get(n.file)) continue;
      const prior = testHits.get(n.file);
      if (!prior) {
        testHits.set(n.file, { file: n.file, nodes: 1, minDepth: n.depth });
      } else {
        prior.nodes += 1;
        prior.minDepth = Math.min(prior.minDepth, n.depth);
      }
    }
  } finally {
    db.close();
  }

  const tests = [...testHits.values()].sort((a, b) => a.file.localeCompare(b.file));
  const totalTests = countTestFiles(projectPath);
  const skippedFiles = Math.max(0, totalTests - tests.length);
  const percent = totalTests === 0 ? 0 : Math.round((skippedFiles / totalTests) * 100);

  return {
    mode: "static",
    reason:
      files.length > 0
        ? `changed ${files.length} file(s)`
        : query.symbols?.length
          ? `symbols ${query.symbols.join(", ")}`
          : "empty selection",
    tests,
    skipped: { files: skippedFiles, percent },
    command: buildTestCommand(
      projectPath,
      tests.map((t) => t.file),
      cfg,
      tests.length === 0 ? "none" : "subset",
    ),
    warnings,
  };
}

function listWorktreeChanges(projectPath: string): string[] {
  // Prefer merge-base against main/master when available; else HEAD.
  for (const base of ["main", "master", "HEAD"]) {
    const files = changedFiles(projectPath, base);
    if (files.length > 0 || base === "HEAD") return files;
  }
  return [];
}

function countTestFiles(projectPath: string): number {
  if (!indexExists(projectPath)) return 0;
  const db = openDb(projectPath);
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM files WHERE is_test = 1").get() as {
      n: number;
    };
    return Number(row.n);
  } finally {
    db.close();
  }
}

function listTestFiles(projectPath: string): string[] {
  const db = openDb(projectPath);
  try {
    return (
      db.prepare("SELECT path FROM files WHERE is_test = 1 ORDER BY path").all() as Array<{
        path: string;
      }>
    ).map((r) => r.path);
  } finally {
    db.close();
  }
}

/**
 * Build an executable test command from package.json scripts.test when present.
 *
 * @param projectPath - Project root.
 * @param tests - Selected test paths (ignored for mode `all`).
 * @param _cfg - Reserved for future runner overrides.
 * @param mode - `all` | `subset` | `none`.
 */
export function buildTestCommand(
  projectPath: string,
  tests: string[],
  _cfg: AffectedConfig,
  mode: "all" | "subset" | "none",
): string {
  const pkgPath = path.join(projectPath, "package.json");
  let script: string | undefined;
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      script = pkg.scripts?.test;
    } catch {
      /* ignore */
    }
  }

  if (mode === "all") {
    return script ? "npm test" : "node --test";
  }
  if (mode === "none" || tests.length === 0) {
    return script ? "npm test -- --test-name-pattern=^$" : "node --test --test-name-pattern=^$";
  }

  const args = tests.map(shellQuote).join(" ");
  if (script && /\bnode\s+--test\b/.test(script)) {
    return `node --test ${args}`;
  }
  if (script) {
    // Pass paths after `--` for npm/vitest/jest-style scripts.
    return `npm test -- ${args}`;
  }
  return `node --test ${args}`;
}

function shellQuote(p: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(p)) return p;
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

/** Warn when present extensions are not in the indexed language set. */
function warnUnindexedLanguages(projectPath: string): string[] {
  const indexedExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
  const seen = new Set<string>();
  const warnings: string[] = [];
  walkQuick(projectPath, (rel) => {
    const ext = path.extname(rel).toLowerCase();
    if (!ext || indexedExts.has(ext) || seen.has(ext)) return;
    // Only flag common source extensions that Compass does not parse.
    if (![".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs"].includes(ext)) return;
    seen.add(ext);
    warnings.push(`${ext} files are present but not indexed by Compass`);
  });
  return warnings;
}

function walkQuick(root: string, visit: (rel: string) => void): void {
  const skip = new Set([".git", "node_modules", "dist", "dist-test", ".speclaw", "vendor"]);
  const stack = [root];
  let n = 0;
  while (stack.length && n < 5000) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".speclaw") {
        if (e.isDirectory() && e.name !== ".github") continue;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(full);
      } else if (e.isFile()) {
        n++;
        visit(path.relative(root, full));
      }
    }
  }
}
