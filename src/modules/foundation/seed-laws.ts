import fs from "node:fs";
import path from "node:path";
import { assetsDir } from "../../shared/paths.js";
import type { Law, LawManifest, Verification } from "./laws.js";

// Catalog adapter: the shipped JSON is speclaw's own architecture plus a few
// portable laws. Consumer repos get only what their tree can actually host —
// never compass/foundation/ATTRIBUTION rules copied from this package.

const ASSETS = assetsDir(import.meta.url);

const CATALOG_PATH = path.join(ASSETS, "laws", "laws-manifest.json");

/** Globs that drop test doubles from the cycle-law graph. */
export const TEST_SCOPE_EXCLUSIONS: readonly string[] = [
  "!**/*.{spec,test}.{ts,tsx,js,jsx}",
  "!**/test/**",
  "!**/__tests__/**",
];

/** Adapter metadata on a shipped catalog law; stripped before persist. */
export interface CatalogLaw extends Law {
  /** Every entry must exist (file, directory, or glob) or the law is omitted. */
  requires?: string[];
  /** Rewrite `scope` from detected source roots when catalog defaults miss. */
  adaptScope?: "source-roots";
}

interface LawCatalog {
  version: number;
  laws: CatalogLaw[];
}

let cachedCatalog: LawCatalog | null = null;

/**
 * Read the shipped law catalog (including adapter metadata). Cached for the
 * process; tests that mutate the asset are not a supported path.
 *
 * @returns The parsed catalog.
 * @throws If the asset is missing or not an object with a `laws` array.
 */
export function readLawCatalog(): LawCatalog {
  if (cachedCatalog) return cachedCatalog;
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as LawCatalog;
  if (!raw || !Array.isArray(raw.laws)) {
    throw new Error(`invalid law catalog at ${CATALOG_PATH}`);
  }
  cachedCatalog = raw;
  return raw;
}

/** Drop adapter-only fields so the result is a persistable `Law`. */
export function asLaw(entry: CatalogLaw): Law {
  const law: Law = {
    id: entry.id,
    title: entry.title,
    severity: entry.severity,
    scope: [...entry.scope],
    prose: entry.prose,
    verification: cloneVerification(entry.verification),
    enforcement: entry.enforcement,
    source: { ...entry.source },
  };
  if (entry.rationale !== undefined) law.rationale = entry.rationale;
  if (entry.status !== undefined) law.status = entry.status;
  return law;
}

function cloneVerification(v: Verification): Verification {
  if (v.kind === "deps") return { kind: "deps", rule: { ...v.rule } };
  if (v.kind === "graph") return { kind: "graph", rule: { ...v.rule } };
  return { kind: v.kind };
}

/**
 * Whether `req` names an existing file, directory, or glob under `projectPath`.
 *
 * @param projectPath - Project root.
 * @param req - Relative path or glob (`*` / `**` in a segment).
 */
export function pathRequirementExists(projectPath: string, req: string): boolean {
  const trimmed = req.replace(/^!/, "").replace(/\/\*\*$/, "");
  return globExists(projectPath, trimmed.split("/").filter(Boolean));
}

function globExists(dir: string, parts: string[]): boolean {
  if (parts.length === 0) return fs.existsSync(dir);
  if (!fs.existsSync(dir)) return false;
  const head = parts[0]!;
  const rest = parts.slice(1);
  if (head === "**") {
    if (globExists(dir, rest)) return true;
    let st: fs.Stats;
    try {
      st = fs.statSync(dir);
    } catch {
      return false;
    }
    if (!st.isDirectory()) return false;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      if (globExists(path.join(dir, name), parts)) return true;
    }
    return false;
  }
  if (head === "*") {
    let st: fs.Stats;
    try {
      st = fs.statSync(dir);
    } catch {
      return false;
    }
    if (!st.isDirectory()) return false;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      if (globExists(path.join(dir, name), rest)) return true;
    }
    return false;
  }
  return globExists(path.join(dir, head), rest);
}

function childSrcExists(projectPath: string, parent: string): boolean {
  const dir = path.join(projectPath, parent);
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
  } catch {
    return false;
  }
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    try {
      if (fs.statSync(path.join(dir, name, "src")).isDirectory()) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/**
 * Source-root globs inferred from a repository layout.
 *
 * @param projectPath - Project root.
 * @returns Globs covering app/package `src` trees, plus top-level `src/` or `lib/`, when they exist.
 */
export function detectSourceRootGlobs(projectPath: string): string[] {
  const out: string[] = [];
  if (childSrcExists(projectPath, "apps")) out.push("apps/*/src/**");
  if (childSrcExists(projectPath, "packages")) out.push("packages/*/src/**");
  if (pathRequirementExists(projectPath, "src")) out.push("src/**");
  if (pathRequirementExists(projectPath, "lib")) out.push("lib/**");
  return out;
}

function positivesSatisfied(projectPath: string, scope: string[]): boolean {
  const positives = scope.filter((g) => !g.startsWith("!"));
  if (positives.length === 0) return true;
  return positives.some((g) => pathRequirementExists(projectPath, g));
}

function withTestExclusions(scope: string[]): string[] {
  const have = new Set(scope);
  const out = [...scope];
  for (const g of TEST_SCOPE_EXCLUSIONS) {
    if (!have.has(g)) out.push(g);
  }
  return out;
}

function adaptCycleLaw(projectPath: string, entry: CatalogLaw): Law | null {
  const law = asLaw(entry);
  const catalogHits = positivesSatisfied(projectPath, entry.scope);
  const roots = catalogHits
    ? entry.scope.filter((g) => !g.startsWith("!"))
    : detectSourceRootGlobs(projectPath);
  if (roots.length === 0) return null;
  law.scope = withTestExclusions(roots);
  if (law.verification.kind === "graph") {
    law.verification = {
      kind: "graph",
      rule: { ...law.verification.rule, circular: true, edgeKinds: ["import"] },
    };
  }
  return law;
}

function isApplicable(projectPath: string, entry: CatalogLaw): boolean {
  const reqs = entry.requires ?? [];
  return reqs.every((r) => pathRequirementExists(projectPath, r));
}

/**
 * Catalog laws stripped of adapter metadata — the full shipped set, unfiltered.
 *
 * @returns Persistable laws in catalog order.
 */
export function catalogLaws(): Law[] {
  return readLawCatalog().laws.map(asLaw);
}

/**
 * Laws from the catalog that apply to `projectPath`, with cycle-law scope
 * rewritten to the repo's real source roots when needed.
 *
 * @param projectPath - Project root whose tree is inspected.
 * @returns Persistable laws; adapter fields omitted.
 */
export function adaptedLaws(projectPath: string): Law[] {
  // Covers: req~adapt-seed-to-repo~1
  const out: Law[] = [];
  for (const entry of readLawCatalog().laws) {
    if (!isApplicable(projectPath, entry)) continue;
    if (entry.adaptScope === "source-roots") {
      const adapted = adaptCycleLaw(projectPath, entry);
      if (adapted) out.push(adapted);
      continue;
    }
    out.push(asLaw(entry));
  }
  return out;
}

/** True when `existing` is still the shipped catalog text (title + prose). */
export function isUnmodifiedCatalogLaw(existing: Law, catalog: CatalogLaw): boolean {
  return existing.title === catalog.title && existing.prose === catalog.prose;
}

/**
 * Merge an on-disk manifest with the adapted catalog: append applicable ids,
 * rewrite unmodified cycle-law scope, drop unmodified inapplicable dogfood.
 *
 * @param existing - The project's current manifest.
 * @param projectPath - Project root used to adapt the catalog.
 * @returns The merged manifest and the ids that were added or removed.
 */
export function mergeAdaptedSeed(
  existing: LawManifest,
  projectPath: string,
): { manifest: LawManifest; added: string[]; removed: string[] } {
  const catalog = readLawCatalog();
  const byId = new Map(catalog.laws.map((l) => [l.id, l]));
  const adapted = adaptedLaws(projectPath);
  const adaptedById = new Map(adapted.map((l) => [l.id, l]));
  const added: string[] = [];
  const removed: string[] = [];
  const result: Law[] = [];
  const seen = new Set<string>();

  for (const law of existing.laws) {
    const cat = byId.get(law.id);
    if (!cat || !isUnmodifiedCatalogLaw(law, cat)) {
      result.push(law);
      seen.add(law.id);
      continue;
    }
    const next = adaptedById.get(law.id);
    if (next) {
      result.push(next);
      seen.add(law.id);
    } else {
      removed.push(law.id);
    }
  }
  for (const law of adapted) {
    if (seen.has(law.id)) continue;
    result.push(law);
    added.push(law.id);
    seen.add(law.id);
  }
  return { manifest: { ...existing, laws: result }, added, removed };
}
