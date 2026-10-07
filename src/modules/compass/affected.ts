/**
 * Static affected-test selection: reverse reachability into `files.is_test = 1`,
 * plus ready-to-run commands per package (runner detected from `package.json`).
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
  matchGlob,
  type AffectedConfig,
} from "./affected-config.js";

/** One selected test file in an {@link AffectedTestsResult}. */
export interface AffectedTestFile {
  file: string;
  nodes: number;
  minDepth: number;
}

/** One package-scoped test command: run `command` from `cwd`. */
export interface AffectedTestCommand {
  /** Repo-relative directory of the nearest `package.json` (`.` for the root). */
  cwd: string;
  command: string;
  /** Selected test files, relative to `cwd` (empty for a full-suite run). */
  files: string[];
}

/** The runnable form of a selection: one command string plus its per-package parts. */
export interface TestCommandPlan {
  /**
   * Shell command to run from the repository root, or `null` when no test is
   * selected — never a command that runs nothing and passes.
   */
  command: string | null;
  /** Why this command (or why none); always non-empty. */
  commandReason: string;
  /** Per-package commands; empty exactly when `command` is null. */
  commands: AffectedTestCommand[];
}

/** Result of {@link affectedTests}. */
export interface AffectedTestsResult extends TestCommandPlan {
  mode: "static" | "all";
  reason: string;
  tests: AffectedTestFile[];
  skipped: { files: number; percent: number };
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
        ...planTestCommand(projectPath, [], "none"),
        warnings,
      };
    }
  }

  const glob = matchGlobalFiles(files, cfg);
  if (glob.matched.length > 0) {
    const allTests = listTestFiles(projectPath);
    const reason = `global file matched (${glob.matched.join(", ")})`;
    return {
      mode: "all",
      reason,
      tests: allTests.map((file) => ({ file, nodes: 0, minDepth: 0 })),
      skipped: { files: 0, percent: 0 },
      ...planTestCommand(projectPath, [], "all", reason),
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
    ...planTestCommand(
      projectPath,
      tests.map((t) => t.file),
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
 * Build the command for a selection as a single string (see {@link planTestCommand}).
 *
 * @param projectPath - Project root.
 * @param tests - Selected repo-relative test paths (ignored for mode `all`).
 * @param _cfg - Reserved for future runner overrides.
 * @param mode - `all` | `subset` | `none`.
 * @returns The command to run from the root, or null when nothing is selected.
 */
export function buildTestCommand(
  projectPath: string,
  tests: string[],
  _cfg: AffectedConfig,
  mode: "all" | "subset" | "none",
): string | null {
  return planTestCommand(projectPath, tests, mode).command;
}

/** The fields of a `package.json` the runner detection reads. */
interface PackageInfo {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Read a `package.json`; null when absent or unparseable. */
function readPackage(dir: string): PackageInfo | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as PackageInfo;
  } catch {
    return null;
  }
}

/**
 * Turn a selection into runnable commands.
 *
 * - `none`: `command` is null with a reason; a run-nothing command is never emitted.
 * - `all`: the root runner's full suite.
 * - `subset`: files are grouped by their nearest `package.json` directory
 *   (bounded by the root) and each group gets its own runner's command:
 *   `npx vitest run`, `npx jest --runTestsByPath`, the `node --test` script's
 *   flags without coverage flags (mapped onto a compiled-test glob, after
 *   `npm run pretest`), or `npm test -- <files>` for an unrecognized script.
 *   Several groups compose as `(cd a && …) && (cd b && …)` from the root.
 *
 * @param projectPath - Project root.
 * @param tests - Selected repo-relative test paths (ignored unless `subset`).
 * @param mode - `all` | `subset` | `none`.
 * @param allReason - Why the full suite was selected (mode `all`).
 * @returns The command plan; `commands` is empty exactly when `command` is null.
 */
export function planTestCommand(
  projectPath: string,
  tests: string[],
  mode: "all" | "subset" | "none",
  allReason = "the full suite was selected",
): TestCommandPlan {
  // Covers: req~affected-test-selection~1
  if (mode === "all") {
    const command = fullSuiteCommand(readPackage(projectPath));
    return {
      command,
      commandReason: `${allReason}; run the full suite`,
      commands: [{ cwd: ".", command, files: [] }],
    };
  }
  if (mode === "none" || tests.length === 0) {
    return {
      command: null,
      commandReason: "no test file is reachable from the change; nothing to run",
      commands: [],
    };
  }

  const groups = new Map<string, string[]>();
  const nearest = new Map<string, string>();
  for (const t of [...tests].sort()) {
    const cwd = nearestPackageDir(projectPath, path.posix.dirname(t), nearest);
    const rel = cwd === "." ? t : t.slice(cwd.length + 1);
    groups.set(cwd, [...(groups.get(cwd) ?? []), rel]);
  }

  const commands: AffectedTestCommand[] = [];
  const notes: string[] = [];
  const runners: string[] = [];
  for (const cwd of [...groups.keys()].sort()) {
    const files = groups.get(cwd)!;
    const own = readPackage(path.join(projectPath, cwd));
    const inherited = inheritedRunner(projectPath, cwd, own);
    const plan = groupCommand(inherited?.pkg ?? own, files);
    if (inherited) {
      const from =
        inherited.dir === "." ? "the root package.json" : `${inherited.dir}/package.json`;
      plan.note = [`${plan.runner} inherited from ${from}`, plan.note]
        .filter((n): n is string => n !== undefined)
        .join("; ");
    }
    if (plan.note) notes.push(cwd === "." ? plan.note : `${cwd}: ${plan.note}`);
    if (plan.command === null) continue;
    commands.push({ cwd, command: plan.command, files: plan.kept ?? files });
    runners.push(`${cwd}: ${plan.runner}`);
  }
  if (commands.length === 0) {
    return {
      command: null,
      commandReason: `no runnable test file is selected; ${notes.join("; ")}`,
      commands: [],
    };
  }

  const command =
    commands.length === 1
      ? commands[0]!.cwd === "."
        ? commands[0]!.command
        : `cd ${shellQuote(commands[0]!.cwd)} && ${commands[0]!.command}`
      : commands
          .map((c) =>
            c.cwd === "." ? `(${c.command})` : `(cd ${shellQuote(c.cwd)} && ${c.command})`,
          )
          .join(" && ");
  const head =
    commands.length === 1
      ? `${runners[0]!.split(": ")[1]} in ${commands[0]!.cwd} for ${tests.length} selected test file(s)`
      : `${tests.length} selected test file(s) across ${commands.length} packages (${runners.join(", ")}); run from the repository root`;
  return {
    command,
    commandReason: [head, ...notes].join("; "),
    commands,
  };
}

/** Full-suite command for a package (root `all` mode). */
function fullSuiteCommand(pkg: PackageInfo | null): string {
  if (pkg?.scripts?.test) return "npm test";
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps.vitest) return "npx vitest run";
  if (deps.jest) return "npx jest";
  return "node --test";
}

/** Nearest directory at or above `dir` (repo-relative) holding a `package.json`; `.` at worst. */
function nearestPackageDir(root: string, dir: string, cache: Map<string, string>): string {
  const hit = cache.get(dir);
  if (hit !== undefined) return hit;
  let found: string;
  if (dir === "." || dir === "" || dir === "/") found = ".";
  else if (fs.existsSync(path.join(root, dir, "package.json"))) found = dir;
  else found = nearestPackageDir(root, path.posix.dirname(dir), cache);
  cache.set(dir, found);
  return found;
}

/** Whether a package declares vitest or jest as a dependency. */
function declaresRunner(pkg: PackageInfo | null): boolean {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return Boolean(deps.vitest || deps.jest);
}

/**
 * Runner inherited by a package that declares none (no `scripts.test`, no
 * vitest/jest dependency): the nearest ancestor `package.json`, up to the
 * root, that declares vitest or jest — the hoisted-monorepo layout. Returns
 * the package to plan with (the leaf with the ancestor's runner dependencies)
 * and the ancestor's directory, or null when nothing is inherited.
 */
function inheritedRunner(
  root: string,
  cwd: string,
  own: PackageInfo | null,
): { pkg: PackageInfo; dir: string } | null {
  if (cwd === "." || own?.scripts?.test || declaresRunner(own)) return null;
  let dir = cwd;
  while (dir !== ".") {
    dir = path.posix.dirname(dir);
    if (dir === "" || dir === "/") dir = ".";
    const anc = readPackage(path.join(root, dir));
    if (!declaresRunner(anc)) continue;
    const deps = { ...anc?.dependencies, ...anc?.devDependencies };
    const runnerDeps: Record<string, string> = {};
    if (deps.vitest) runnerDeps.vitest = deps.vitest;
    if (deps.jest) runnerDeps.jest = deps.jest;
    return {
      pkg: { ...own, devDependencies: { ...own?.devDependencies, ...runnerDeps } },
      dir,
    };
  }
  return null;
}

/** Flags dropped from a `node --test` script: coverage thresholds fail on a subset. */
function isCoverageFlag(token: string): boolean {
  return token === "--experimental-test-coverage" || token.startsWith("--test-coverage-");
}

/** Node flags whose value may follow as a separate word (`--import ./x.mjs`). */
const NODE_VALUE_FLAGS = new Set([
  "--import",
  "--require",
  "-r",
  "--loader",
  "--experimental-loader",
  "--env-file",
  "--conditions",
  "-C",
  "--test-reporter",
  "--test-reporter-destination",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-concurrency",
  "--test-timeout",
  "--test-shard",
  "--test-coverage-lines",
  "--test-coverage-branches",
  "--test-coverage-functions",
  "--test-coverage-include",
  "--test-coverage-exclude",
]);

/**
 * Split a `node --test` script's words (after `node`) into the flags to keep
 * and the positional test globs. A value-taking flag keeps its value with it;
 * coverage flags are dropped together with their values. A directory
 * positional (no glob character, no file extension) becomes `<dir>/**`, so it
 * matches every file under it.
 */
function splitNodeTestArgs(words: string[]): { flags: string[]; globs: string[] } {
  const flags: string[] = [];
  const globs: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (word.startsWith("-")) {
      const group = [word];
      if (!word.includes("=") && NODE_VALUE_FLAGS.has(word) && i + 1 < words.length) {
        group.push(words[++i]!);
      }
      if (!isCoverageFlag(word)) flags.push(...group);
      continue;
    }
    const isDir = !/[*?{[]/.test(word) && !/\.[cm]?[jt]sx?$/.test(word);
    globs.push(isDir ? `${word.replace(/\/+$/, "")}/**` : word);
  }
  return { flags, globs };
}

/** Source extensions mapped to their compiled JavaScript counterparts. */
const COMPILED_EXT: Array<[RegExp, string]> = [
  [/\.tsx?$/, ".js"],
  [/\.mts$/, ".mjs"],
  [/\.cts$/, ".cjs"],
];

/** Source path with its TypeScript extension swapped for the compiled one. */
function compiledPath(file: string): string {
  let out = file;
  for (const [re, ext] of COMPILED_EXT) out = out.replace(re, ext);
  return out;
}

/**
 * Map a source test path onto the script's globs: the path itself when a glob
 * matches it, else `<first glob segment>/<compiled path>` when that matches.
 * `helper` marks a file whose name no glob's last segment can match (e.g.
 * `test/helpers/fixtures.ts` against `*.test.js`): the runner never executes it,
 * not even in a full run, so it is left out rather than forcing the full suite.
 * `null` means a test-shaped file that could not be mapped.
 */
function mapOntoGlobs(file: string, globs: string[]): string | "helper" | null {
  if (globs.some((g) => matchGlob(file, g))) return file;
  const base = path.posix.basename(file);
  const testShaped = globs.some((g) => {
    const last = g.split("/").pop() ?? g;
    return matchGlob(base, last) || matchGlob(compiledPath(base), last);
  });
  if (!testShaped) return "helper";
  for (const glob of globs) {
    const first = glob.split("/")[0]!;
    if (!first || /[*{]/.test(first)) continue;
    const mapped = `${first}/${compiledPath(file)}`;
    if (matchGlob(mapped, glob)) return mapped;
  }
  return null;
}

/**
 * Command for one package group, with its detected runner and an optional note.
 * `command` is null only when every file is a helper the runner never executes;
 * `kept` lists the files the command runs when helpers were left out.
 */
function groupCommand(
  pkg: PackageInfo | null,
  files: string[],
): { command: string | null; runner: string; note?: string; kept?: string[] } {
  const script = pkg?.scripts?.test;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const args = files.map(shellQuote).join(" ");
  const tokens = script ? shellSplit(script) : [];
  const isNodeTest = tokens[0] === "node" && tokens.includes("--test");

  if ((script && /\bvitest\b/.test(script)) || (!script && deps.vitest)) {
    return { command: `npx vitest run ${args}`, runner: "vitest" };
  }
  if ((script && /\bjest\b/.test(script)) || (!isNodeTest && deps.jest)) {
    return { command: `npx jest --runTestsByPath ${args}`, runner: "jest" };
  }
  if (isNodeTest) {
    const { flags, globs } = splitNodeTestArgs(tokens.slice(1));
    const base = ["node", ...flags].map(shellQuote).join(" ");
    if (globs.length === 0) return { command: `${base} ${args}`, runner: "node --test" };
    const mapped = files.map((f) => mapOntoGlobs(f, globs));
    if (mapped.some((m) => m === null)) {
      return {
        command: "npm test",
        runner: "node --test",
        note: "a selected test file does not fit the test script's glob, so the full suite runs (a safe superset)",
      };
    }
    const runnable = mapped.filter((m): m is string => m !== null && m !== "helper");
    const kept = files.filter((_, i) => mapped[i] !== "helper");
    const helpers = mapped.length - runnable.length;
    const helperNote =
      helpers > 0 ? `${helpers} helper file(s) the test script never runs left out` : undefined;
    if (runnable.length === 0) return { command: null, runner: "node --test", note: helperNote };
    const compiled = runnable.some((m) => !files.includes(m));
    const prefix = compiled && pkg?.scripts?.pretest ? "npm run pretest && " : "";
    const notes = [
      compiled ? "files mapped onto the compiled test glob; coverage flags dropped" : undefined,
      helperNote,
    ].filter((n): n is string => n !== undefined);
    return {
      command: `${prefix}${base} ${runnable.map(shellQuote).join(" ")}`,
      runner: "node --test",
      note: notes.length > 0 ? notes.join("; ") : undefined,
      kept,
    };
  }
  if (script) {
    return {
      command: `npm test -- ${args}`,
      runner: "npm test",
      note: "unrecognized test script: paths are forwarded and it may run the full suite (a superset)",
    };
  }
  return { command: `node --test ${args}`, runner: "node --test" };
}

/** Split a shell command line into words, honoring single and double quotes. */
function shellSplit(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

function shellQuote(p: string): string {
  if (/^[A-Za-z0-9_./=:,@+-]+$/.test(p)) return p;
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
