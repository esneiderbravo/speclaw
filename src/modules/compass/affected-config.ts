/**
 * Optional `.speclaw/affected.json` plus embedded defaults for global files,
 * test globs, named targets, and ignores used by impact / affected-tests.
 */

import fs from "node:fs";
import path from "node:path";

/** Named CI/build target whose inputs filter which changed paths participate. */
export type AffectedTargetName = "build" | "test" | "lint" | "any";

/** One named target's include/exclude globs. */
export interface TargetGlobs {
  include: string[];
  exclude: string[];
}

/** Validated affected-selection configuration. */
export interface AffectedConfig {
  version: number;
  globalFiles: string[];
  testGlobs: string[];
  targets: Record<Exclude<AffectedTargetName, "any">, TargetGlobs>;
  ignore: string[];
}

const DEFAULT_TARGETS: AffectedConfig["targets"] = {
  build: {
    include: ["src/**"],
    exclude: ["**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}", "test/**", "tests/**"],
  },
  test: {
    include: [
      "src/**",
      "test/**",
      "tests/**",
      "**/*.{test,spec}.{ts,tsx,js,jsx}",
      "**/conftest.py",
    ],
    exclude: [],
  },
  lint: {
    include: ["**/*.{ts,tsx,js,jsx,py}", ".eslintrc*", "eslint.config.*", "ruff.toml"],
    exclude: [],
  },
};

/** Embedded defaults when `.speclaw/affected.json` is absent. */
export const DEFAULT_AFFECTED_CONFIG: AffectedConfig = {
  version: 1,
  globalFiles: [
    "tsconfig*.json",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "LAWS.md",
    "lawbook/config.yaml",
    ".speclaw/rules.json",
    "**/*.config.{ts,js,mjs,cjs}",
  ],
  testGlobs: [
    "test/**",
    "tests/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/conftest.py",
    "**/test_*.py",
  ],
  targets: DEFAULT_TARGETS,
  ignore: [
    "node_modules/**",
    "dist/**",
    "dist-test/**",
    "vendor/**",
    "**/generated/**",
    ".speclaw/**",
  ],
};

/**
 * Glob match supporting `**`, `*`, and simple `{a,b}` brace lists.
 *
 * @param relPath - Project-relative path (either slash style).
 * @param pattern - Glob pattern.
 */
export function matchGlob(relPath: string, pattern: string): boolean {
  const norm = relPath.split("\\").join("/");
  for (const expanded of expandBraces(pattern.split("\\").join("/"))) {
    if (globToRegExp(expanded).test(norm)) return true;
  }
  return false;
}

function expandBraces(pattern: string): string[] {
  const m = pattern.match(/\{([^{}]+)\}/);
  if (!m || m.index === undefined) return [pattern];
  const before = pattern.slice(0, m.index);
  const after = pattern.slice(m.index + m[0].length);
  const alts = m[1]!.split(",");
  const out: string[] = [];
  for (const alt of alts) {
    out.push(...expandBraces(before + alt + after));
  }
  return out;
}

function globToRegExp(pattern: string): RegExp {
  let i = 0;
  let re = "^";
  while (i < pattern.length) {
    if (pattern.startsWith("**/", i) || (pattern.startsWith("**", i) && i + 2 === pattern.length)) {
      re += ".*";
      i += pattern.startsWith("**/", i) ? 3 : 2;
      continue;
    }
    if (pattern[i] === "*") {
      re += "[^/]*";
      i++;
      continue;
    }
    const ch = pattern[i]!;
    if (/[.+^${}()|[\]\\]/.test(ch)) re += `\\${ch}`;
    else re += ch;
    i++;
  }
  re += "$";
  return new RegExp(re);
}

/**
 * Whether a relative path matches any of the given globs.
 *
 * @param relPath - Project-relative path.
 * @param globs - Patterns to try.
 */
export function matchesAny(relPath: string, globs: string[]): boolean {
  return globs.some((g) => matchGlob(relPath, g));
}

/**
 * Infer the module bucket for grouping (nearest package root or first two path segments).
 *
 * @param relPath - Project-relative file path.
 */
export function inferModule(relPath: string): string {
  const norm = relPath.split("\\").join("/");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length === 0) return ".";
  if (parts.length === 1) return parts[0]!;
  // Prefer src/<area>, test/<area>, packages/<name>, …
  return parts.slice(0, 2).join("/");
}

/**
 * Whether a path looks like a test file under the given test globs.
 *
 * @param relPath - Project-relative path.
 * @param testGlobs - Glob list (defaults from config).
 */
export function isTestPath(
  relPath: string,
  testGlobs: string[] = DEFAULT_AFFECTED_CONFIG.testGlobs,
): boolean {
  return matchesAny(relPath, testGlobs);
}

/**
 * Load and validate `.speclaw/affected.json`, or return embedded defaults.
 *
 * @param projectPath - Absolute project root.
 * @returns The effective config.
 * @throws If the file exists but is malformed or has the wrong version shape.
 */
export function loadAffectedConfig(projectPath: string): AffectedConfig {
  const p = path.join(projectPath, ".speclaw", "affected.json");
  if (!fs.existsSync(p)) return { ...DEFAULT_AFFECTED_CONFIG, targets: { ...DEFAULT_TARGETS } };

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(`Invalid .speclaw/affected.json: ${(err as Error).message}`, { cause: err });
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid .speclaw/affected.json: expected a JSON object");
  }
  const doc = raw as Record<string, unknown>;
  if (doc.version !== 1 && doc.version !== undefined) {
    throw new Error(`Invalid .speclaw/affected.json: unsupported version ${String(doc.version)}`);
  }

  const cfg: AffectedConfig = {
    version: 1,
    globalFiles: asStringArray(doc.globalFiles, DEFAULT_AFFECTED_CONFIG.globalFiles),
    testGlobs: asStringArray(doc.testGlobs, DEFAULT_AFFECTED_CONFIG.testGlobs),
    ignore: asStringArray(doc.ignore, DEFAULT_AFFECTED_CONFIG.ignore),
    targets: { ...DEFAULT_TARGETS },
  };

  if (doc.targets && typeof doc.targets === "object") {
    const t = doc.targets as Record<string, unknown>;
    for (const name of ["build", "test", "lint"] as const) {
      const entry = t[name];
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      cfg.targets[name] = {
        include: asStringArray(e.include, DEFAULT_TARGETS[name].include),
        exclude: asStringArray(e.exclude, DEFAULT_TARGETS[name].exclude),
      };
    }
  }
  return cfg;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const out = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  return out.length > 0 ? out : [...fallback];
}

/**
 * Filter changed paths for a named target (Nx-style named inputs).
 *
 * @param files - Candidate relative paths.
 * @param target - Target name; `any` keeps all non-ignored paths.
 * @param cfg - Affected config.
 */
export function filterFilesForTarget(
  files: string[],
  target: AffectedTargetName,
  cfg: AffectedConfig,
): { included: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const notIgnored = files.filter((f) => !matchesAny(f, cfg.ignore));
  if (target === "any") return { included: notIgnored, warnings };

  const spec = cfg.targets[target];
  const included = notIgnored.filter((f) => {
    if (spec.exclude.some((g) => matchGlob(f, g))) return false;
    return spec.include.some((g) => matchGlob(f, g));
  });
  if (included.length === 0 && notIgnored.length > 0) {
    warnings.push(
      `Change only affects other targets; empty for target "${target}" (${notIgnored.length} path(s) filtered out)`,
    );
  }
  return { included, warnings };
}

/**
 * Match changed paths against globalFiles globs.
 *
 * @param files - Relative paths.
 * @param cfg - Affected config.
 */
export function matchGlobalFiles(
  files: string[],
  cfg: AffectedConfig,
): { matched: string[]; patterns: string[] } {
  const patterns = new Set<string>();
  const matched: string[] = [];
  for (const f of files) {
    for (const g of cfg.globalFiles) {
      if (matchGlob(f, g)) {
        matched.push(f);
        patterns.add(g);
        break;
      }
    }
  }
  return { matched, patterns: [...patterns] };
}
