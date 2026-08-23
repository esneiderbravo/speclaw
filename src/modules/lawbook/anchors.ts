/**
 * Spec-anchor extraction, resolution, and committed JSON under
 * `lawbook/anchors/<capability>.json`. SQLite `spec_anchors` is a projection only.
 */
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb, rehydrateAnchors } from "../compass/db.js";
import { NORMALIZER_VERSION } from "../compass/hash.js";
import { headSha } from "../../shared/git-history.js";

export type AnchorSource = "covers-link" | "backtick" | "casing" | "path";
export type AnchorResolution = "unique" | "ambiguous" | "unresolved";
export type AnchorKind = "symbol" | "file";

/** One sealed (or sealable) anchor. */
export interface AnchorRecord {
  specId: string;
  requirementId: string;
  scenarioId: string;
  anchorKind: AnchorKind;
  symbolName: string;
  filePath: string | null;
  resolution: AnchorResolution;
  contentHash: string | null;
  rawHash: string | null;
  archivedAt: string;
  commitSha: string | null;
  source: AnchorSource;
  normalizerVersion: number;
}

/** On-disk JSON document for one capability. */
export interface AnchorsFile {
  anchorsVersion: 1;
  capability: string;
  normalizerVersion: number;
  anchors: AnchorRecord[];
}

interface Candidate {
  text: string;
  source: AnchorSource;
  requirementId: string;
  scenarioId: string;
}

interface NodeHit {
  id: number;
  normHash: string | null;
  bodyHash: string | null;
  path: string;
}

const STOPWORDS = new Set([
  "SHALL",
  "MUST",
  "SHOULD",
  "MAY",
  "GIVEN",
  "WHEN",
  "THEN",
  "AND",
  "NOT",
  "Requirement",
  "Scenario",
  "speclaw",
  "Compass",
  "Lawbook",
  "LAWS",
  "AGENTS",
  "CLAUDE",
  "JSON",
  "YAML",
  "SQL",
  "CLI",
  "MCP",
  "API",
  "HTTP",
  "URL",
  "AST",
  "TS",
  "JS",
  "SQLite",
  "TypeScript",
  "GitHub",
  "README",
  "TODO",
  "ISO",
  "UTC",
]);

const RE_BACKTICK = /`([^`\n]{2,80})`/g;
const RE_CASING = /\b([a-z][a-zA-Z0-9]{2,}|[A-Z][a-z][a-zA-Z0-9]{1,})\b/g;
const RE_PATH = /\b((?:src|test|lib|app|packages)\/[\w./-]+\.(?:ts|tsx|js|mjs|py))\b/g;
const RE_COVERS = /\b([a-z]{2,6}~[A-Za-z0-9._-]+~\d+)\b/g;

/** Absolute path to the committed anchors directory. */
export function anchorsDir(projectPath: string): string {
  return path.join(projectPath, "lawbook", "anchors");
}

/** Absolute path to one capability's anchors file. */
export function anchorsPath(projectPath: string, capability: string): string {
  return path.join(anchorsDir(projectPath), `${capability}.json`);
}

/** Extract candidates from a markdown document. */
export function extractCandidates(markdown: string): Candidate[] {
  const out: Candidate[] = [];
  let requirementId = "";
  let scenarioId = "";

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();
    const req = /^###\s+Requirement:\s*(.+)$/.exec(line);
    if (req) {
      requirementId = slug(req[1]!);
      scenarioId = "";
      continue;
    }
    const sce = /^####\s+Scenario:\s*(.+)$/.exec(line);
    if (sce) {
      scenarioId = slug(sce[1]!);
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      requirementId = "";
      scenarioId = "";
      continue;
    }
    if (!requirementId) continue;

    for (const m of line.matchAll(RE_COVERS)) {
      out.push({ text: m[1]!, source: "covers-link", requirementId, scenarioId });
    }
    for (const m of line.matchAll(RE_BACKTICK)) {
      const t = m[1]!.replace(/\(\s*\)$/, "").trim();
      if (!t || t.includes(" ")) continue;
      const source: AnchorSource = RE_PATH.test(t) ? "path" : "backtick";
      RE_PATH.lastIndex = 0;
      out.push({ text: t, source, requirementId, scenarioId });
    }
    for (const m of line.matchAll(RE_CASING)) {
      const t = m[1]!;
      if (STOPWORDS.has(t) || t.length < 3) continue;
      if (!/[a-z]/.test(t) || !/[A-Z]/.test(t)) continue;
      out.push({ text: t, source: "casing", requirementId, scenarioId });
    }
  }
  return dedupe(out);
}

/** Resolve candidates against the Compass graph. */
export function resolveCandidates(
  db: DatabaseSync,
  projectPath: string,
  cands: Candidate[],
  specId: string,
  now: string,
  sha: string | null,
): AnchorRecord[] {
  const rows: AnchorRecord[] = [];
  const byName = db.prepare(
    `SELECT n.id AS id, n.norm_hash AS normHash, n.body_hash AS bodyHash, f.path AS path
       FROM nodes n JOIN files f ON f.id = n.file_id
      WHERE n.name = ? AND n.kind IN ('function','method','class','interface','type')`,
  );

  for (const c of cands) {
    if (c.source === "path") {
      rows.push({
        specId,
        requirementId: c.requirementId,
        scenarioId: c.scenarioId,
        anchorKind: "file",
        symbolName: c.text,
        filePath: c.text,
        resolution: fs.existsSync(path.join(projectPath, c.text)) ? "unique" : "unresolved",
        contentHash: null,
        rawHash: null,
        archivedAt: now,
        commitSha: sha,
        source: c.source,
        normalizerVersion: NORMALIZER_VERSION,
      });
      continue;
    }

    if (c.source === "covers-link") {
      const link = db
        .prepare(
          `SELECT n.id AS id, n.norm_hash AS normHash, n.body_hash AS bodyHash,
                  f.path AS path, n.name AS name
             FROM coverage_links c
             LEFT JOIN nodes n ON n.id = c.node_id
             LEFT JOIN files f ON f.id = n.file_id
            WHERE c.artifact_type || '~' || c.name || '~' || c.revision = ?
            LIMIT 2`,
        )
        .all(c.text) as unknown as Array<NodeHit & { name: string | null }>;
      if (link.length === 1 && link[0]!.id != null && link[0]!.name) {
        rows.push(mkSymbol(c, specId, link[0]!, "unique", now, sha, link[0]!.name));
      } else {
        rows.push(mkUnresolved(c, specId, now, sha));
      }
      continue;
    }

    const matches = byName.all(c.text) as unknown as NodeHit[];
    if (matches.length === 1) {
      rows.push(mkSymbol(c, specId, matches[0]!, "unique", now, sha, c.text));
    } else if (matches.length > 1) {
      rows.push({
        specId,
        requirementId: c.requirementId,
        scenarioId: c.scenarioId,
        anchorKind: "symbol",
        symbolName: c.text,
        filePath: matches[0]!.path,
        resolution: "ambiguous",
        contentHash: null,
        rawHash: null,
        archivedAt: now,
        commitSha: sha,
        source: c.source,
        normalizerVersion: NORMALIZER_VERSION,
      });
    } else if (c.source === "backtick") {
      rows.push(mkUnresolved(c, specId, now, sha));
    }
  }
  return rows;
}

function mkSymbol(
  c: Candidate,
  specId: string,
  hit: NodeHit,
  resolution: AnchorResolution,
  now: string,
  sha: string | null,
  name: string,
): AnchorRecord {
  return {
    specId,
    requirementId: c.requirementId,
    scenarioId: c.scenarioId,
    anchorKind: "symbol",
    symbolName: name,
    filePath: hit.path,
    resolution,
    contentHash: hit.normHash,
    rawHash: hit.bodyHash,
    archivedAt: now,
    commitSha: sha,
    source: c.source,
    normalizerVersion: NORMALIZER_VERSION,
  };
}

function mkUnresolved(c: Candidate, specId: string, now: string, sha: string | null): AnchorRecord {
  return {
    specId,
    requirementId: c.requirementId,
    scenarioId: c.scenarioId,
    anchorKind: "symbol",
    symbolName: c.text,
    filePath: null,
    resolution: "unresolved",
    contentHash: null,
    rawHash: null,
    archivedAt: now,
    commitSha: sha,
    source: c.source,
    normalizerVersion: NORMALIZER_VERSION,
  };
}

/** Read a capability anchors file, or null when absent. */
export function readAnchorsFile(projectPath: string, capability: string): AnchorsFile | null {
  const p = anchorsPath(projectPath, capability);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as AnchorsFile;
}

/** Write anchors JSON only (caller refreshes SQLite projection). */
export function writeAnchorsFile(projectPath: string, doc: AnchorsFile): string {
  const dir = anchorsDir(projectPath);
  fs.mkdirSync(dir, { recursive: true });
  const sorted = [...doc.anchors].sort((a, b) =>
    `${a.requirementId}\0${a.scenarioId}\0${a.symbolName}`.localeCompare(
      `${b.requirementId}\0${b.scenarioId}\0${b.symbolName}`,
    ),
  );
  const dest = anchorsPath(projectPath, doc.capability);
  fs.writeFileSync(dest, JSON.stringify({ ...doc, anchors: sorted }, null, 2) + "\n", "utf8");
  return dest;
}

/** List capability names that already have an anchors file. */
export function listAnchoredCapabilities(projectPath: string): string[] {
  const dir = anchorsDir(projectPath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.replace(/\.json$/, ""))
    .sort();
}

export interface SealSummary {
  capability: string;
  unique: number;
  ambiguous: number;
  unresolved: number;
  path: string;
  warned: boolean;
}

/** Seal anchors for one capability from markdown and refresh the projection. */
export function sealCapability(
  projectPath: string,
  capability: string,
  markdown: string,
  opts: { specId?: string; now?: string } = {},
): SealSummary {
  const db = openDb(projectPath);
  try {
    const now = opts.now ?? new Date().toISOString();
    const sha = headSha(projectPath);
    const specId = opts.specId ?? capability;
    const rows = resolveCandidates(db, projectPath, extractCandidates(markdown), specId, now, sha);
    const dest = writeAnchorsFile(projectPath, {
      anchorsVersion: 1,
      capability,
      normalizerVersion: NORMALIZER_VERSION,
      anchors: rows,
    });
    rehydrateAnchors(db, projectPath);
    return {
      capability,
      unique: rows.filter((r) => r.resolution === "unique").length,
      ambiguous: rows.filter((r) => r.resolution === "ambiguous").length,
      unresolved: rows.filter((r) => r.resolution === "unresolved").length,
      path: path.relative(projectPath, dest),
      warned: rows.length === 0,
    };
  } finally {
    db.close();
  }
}

/** Seal every canonical capability under lawbook/specs/ that has a spec.md. */
export function resealAll(projectPath: string): SealSummary[] {
  const specsRoot = path.join(projectPath, "lawbook", "specs");
  if (!fs.existsSync(specsRoot)) return [];
  const out: SealSummary[] = [];
  for (const name of fs.readdirSync(specsRoot)) {
    const specPath = path.join(specsRoot, name, "spec.md");
    if (!fs.existsSync(specPath)) continue;
    out.push(sealCapability(projectPath, name, fs.readFileSync(specPath, "utf8")));
  }
  return out;
}

function slug(title: string): string {
  return title
    .replace(/`[^`]+`/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const k = `${c.requirementId}\0${c.scenarioId}\0${c.source}\0${c.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
