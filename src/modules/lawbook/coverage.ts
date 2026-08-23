import fs from "node:fs";
import path from "node:path";
import { openDb, indexExists } from "../compass/db.js";
import {
  formatItemId,
  loadSpecItems,
  parseItemId,
  parseSpecItems,
  type SpecItem,
  type SpecItemId,
} from "./spec-items.js";

/** Coverage knobs loaded from lawbook/config.yaml (with defaults). */
export interface CoverageConfig {
  defaultNeeds: string[];
  gateStatuses: string[];
  gateArchive: boolean;
  sources: Record<string, string[]>;
  exclude: string[];
}

export const DEFAULT_COVERAGE_CONFIG: CoverageConfig = {
  defaultNeeds: ["impl", "utest"],
  gateStatuses: ["approved"],
  gateArchive: true,
  sources: {
    impl: ["src/**"],
    utest: ["test/unit/**", "test/**/*.test.ts", "test/**/*.test.js"],
    itest: ["test/integration/**"],
  },
  exclude: ["**/node_modules/**", "**/dist/**", "**/.speclaw/**"],
};

export type LinkStatus = "Covers" | "Outdated" | "Predated" | "Orphaned" | "Unwanted" | "Ambiguous";

/** One coverage link after classification. */
export interface CoverageLink {
  artifactType: string;
  name: string;
  revision: number;
  kind: string;
  filePath: string;
  line: number;
  nodeId: number | null;
  sourceType: string;
  origin: string;
  status: LinkStatus;
  reason?: string;
}

/** Per-item coverage result. */
export interface CoverageItemResult {
  id: string;
  title: string;
  status: string;
  needs: string[];
  tags: string[];
  depends: string[];
  covers: string[];
  specPath: string;
  line: number;
  coveredTypes: string[];
  uncoveredTypes: string[];
  shallow: boolean;
  deep: boolean;
  links: CoverageLink[];
  directDefects: string[];
  transitiveDefects: string[];
}

/** Full coverage report (JSON schemaVersion 1). */
export interface CoverageReport {
  schemaVersion: 1;
  generatedAt: string;
  summary: {
    items: number;
    identified: number;
    shallowCovered: number;
    deepCovered: number;
    directDefects: number;
    transitiveDefects: number;
  };
  items: CoverageItemResult[];
  orphans: CoverageLink[];
}

interface RawLink {
  artifactType: string;
  name: string;
  revision: number;
  kind: string;
  filePath: string;
  line: number;
  nodeId: number | null;
  sourceType: string;
  origin: string;
  missingFile?: boolean;
}

/**
 * Load coverage config from lawbook/config.yaml when present; otherwise defaults.
 * Parses only a small line-oriented subset (no YAML dependency).
 */
export function loadCoverageConfig(projectPath: string): CoverageConfig {
  const cfg: CoverageConfig = structuredClone(DEFAULT_COVERAGE_CONFIG);
  const cfgPath = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfgPath)) return cfg;
  const text = fs.readFileSync(cfgPath, "utf8");
  const gate = /^\s*gateArchive\s*:\s*(true|false)\s*$/im.exec(text);
  if (gate) cfg.gateArchive = gate[1]!.toLowerCase() === "true";
  const needs = /^\s*defaultNeeds\s*:\s*\[([^\]]*)\]\s*$/im.exec(text);
  if (needs) {
    cfg.defaultNeeds = needs[1]!
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  const statuses = /^\s*gateStatuses\s*:\s*\[([^\]]*)\]\s*$/im.exec(text);
  if (statuses) {
    cfg.gateStatuses = statuses[1]!
      .split(",")
      .map((s) =>
        s
          .trim()
          .replace(/^["']|["']$/g, "")
          .toLowerCase(),
      )
      .filter(Boolean);
  }
  return cfg;
}

/** Glob match supporting `**`, `*`, and path separators. */
export function matchGlob(relPath: string, pattern: string): boolean {
  const norm = relPath.split("\\").join("/");
  // Expand globs before escaping regex metacharacters so `*` is not double-escaped.
  let i = 0;
  let re = "^";
  const p = pattern.split("\\").join("/");
  while (i < p.length) {
    if (p.startsWith("**/", i) || (p.startsWith("**", i) && i + 2 === p.length)) {
      re += ".*";
      i += p.startsWith("**/", i) ? 3 : 2;
      continue;
    }
    if (p[i] === "*") {
      re += "[^/]*";
      i++;
      continue;
    }
    const ch = p[i]!;
    if (/[.+^${}()|[\]\\]/.test(ch)) re += `\\${ch}`;
    else re += ch;
    i++;
  }
  re += "$";
  return new RegExp(re).test(norm);
}

/** Infer artifact type from path using configured source globs. */
export function inferArtifactType(relPath: string, cfg: CoverageConfig): string | null {
  const norm = relPath.split("\\").join("/");
  if (cfg.exclude.some((g) => matchGlob(norm, g))) return null;
  for (const type of ["itest", "utest", "impl"] as const) {
    const globs = cfg.sources[type] ?? [];
    if (globs.some((g) => matchGlob(norm, g))) return type;
  }
  return null;
}

function readIndexLinks(projectPath: string): RawLink[] {
  if (!indexExists(projectPath)) return [];
  const db = openDb(projectPath);
  try {
    const rows = db
      .prepare(
        `SELECT artifact_type, name, revision, kind, file_path, line, node_id, source_type, origin
         FROM coverage_links`,
      )
      .all() as Array<{
      artifact_type: string;
      name: string;
      revision: number;
      kind: string;
      file_path: string;
      line: number;
      node_id: number | null;
      source_type: string;
      origin: string;
    }>;
    return rows.map((r) => ({
      artifactType: r.artifact_type,
      name: r.name,
      revision: r.revision,
      kind: r.kind,
      filePath: r.file_path,
      line: r.line,
      nodeId: r.node_id,
      sourceType: r.source_type,
      origin: r.origin,
    }));
  } finally {
    db.close();
  }
}

function inlineLinksAsRaw(projectPath: string, items: SpecItem[], cfg: CoverageConfig): RawLink[] {
  const out: RawLink[] = [];
  for (const item of items) {
    if (!item.id) continue;
    for (const inl of item.inlineLinks) {
      const abs = path.join(projectPath, inl.targetPath);
      const exists = fs.existsSync(abs);
      const inferred =
        inferArtifactType(inl.targetPath, cfg) ?? (inl.kind === "test" ? "utest" : "impl");
      out.push({
        artifactType: item.id.artifactType,
        name: item.id.name,
        revision: item.id.revision,
        kind: "covers",
        filePath: inl.targetPath,
        line: inl.line,
        nodeId: null,
        sourceType: inferred,
        origin: "inline-test-link",
        missingFile: !exists,
      });
    }
  }
  return out;
}

function classifyLink(
  link: RawLink,
  item: SpecItem | undefined,
  idCounts: Map<string, number>,
  cfg: CoverageConfig,
): CoverageLink {
  const base: CoverageLink = {
    artifactType: link.artifactType,
    name: link.name,
    revision: link.revision,
    kind: link.kind,
    filePath: link.filePath,
    line: link.line,
    nodeId: link.nodeId,
    sourceType: link.sourceType,
    origin: link.origin,
    status: "Covers",
  };

  if (link.missingFile) {
    return { ...base, status: "Orphaned", reason: "missing-file" };
  }
  if (cfg.exclude.some((g) => matchGlob(link.filePath, g))) {
    return { ...base, status: "Orphaned", reason: "excluded-path" };
  }
  if (!item || !item.id) {
    return { ...base, status: "Orphaned", reason: "unknown-item" };
  }
  if ((idCounts.get(item.idText!) ?? 0) > 1) {
    return { ...base, status: "Ambiguous", reason: "duplicate-id" };
  }
  if (item.status === "rejected") {
    return { ...base, status: "Unwanted", reason: "item-rejected" };
  }
  if (link.revision < item.id.revision) {
    return { ...base, status: "Outdated", reason: "revision-behind" };
  }
  if (link.revision > item.id.revision) {
    return { ...base, status: "Predated", reason: "revision-ahead" };
  }
  const inferred = inferArtifactType(link.filePath, cfg);
  if (inferred) base.sourceType = inferred;
  return base;
}

/**
 * Build a full coverage report for a project (canonical specs by default).
 *
 * @param projectPath - Absolute project root.
 * @param opts.change - Limit items to a change's delta specs (archive gate).
 * @param opts.cfg - Optional preloaded config.
 * @param opts.now - Optional fixed timestamp for deterministic JSON.
 */
export function buildCoverageReport(
  projectPath: string,
  opts: { change?: string; cfg?: CoverageConfig; now?: string } = {},
): CoverageReport {
  const cfg = opts.cfg ?? loadCoverageConfig(projectPath);
  const items = loadSpecItems(projectPath, { change: opts.change });
  const identified = items.filter((i) => i.id !== null);

  const idCounts = new Map<string, number>();
  for (const it of identified) {
    idCounts.set(it.idText!, (idCounts.get(it.idText!) ?? 0) + 1);
  }

  const rawLinks = [
    ...readIndexLinks(projectPath),
    ...inlineLinksAsRaw(projectPath, identified, cfg),
  ];

  const results: CoverageItemResult[] = [];
  const matchedKeys = new Set<string>();

  for (const item of identified) {
    const idText = item.idText!;
    const needs = item.needs.length > 0 ? item.needs : [...cfg.defaultNeeds];
    const itemLinks = rawLinks
      .filter((l) => l.artifactType === item.id!.artifactType && l.name === item.id!.name)
      .map((l) => {
        matchedKeys.add(`${l.filePath}:${l.line}:${l.revision}:${l.kind}`);
        return classifyLink(l, item, idCounts, cfg);
      });

    const covering = itemLinks.filter((l) => l.status === "Covers");
    const coveredTypes = [...new Set(covering.map((l) => l.sourceType))];
    const uncoveredTypes = needs.filter((n) => !coveredTypes.includes(n));
    const shallow = uncoveredTypes.length === 0 && (idCounts.get(idText) ?? 0) === 1;

    const directDefects: string[] = [];
    if ((idCounts.get(idText) ?? 0) > 1) {
      directDefects.push(`duplicate id ${idText} at ${item.specPath}:${item.line}`);
    }
    for (const t of uncoveredTypes) {
      directDefects.push(`missing ${t} for ${idText} at ${item.specPath}:${item.line}`);
    }
    for (const l of itemLinks) {
      if (
        l.status === "Outdated" ||
        l.status === "Orphaned" ||
        l.status === "Ambiguous" ||
        l.status === "Unwanted"
      ) {
        directDefects.push(
          `${l.status} link ${l.filePath}:${l.line} → ${idText}` +
            (l.reason ? ` (${l.reason})` : ""),
        );
      }
    }

    results.push({
      id: idText,
      title: item.title,
      status: item.status,
      needs,
      tags: item.tags,
      depends: item.depends,
      covers: item.covers,
      specPath: item.specPath,
      line: item.line,
      coveredTypes,
      uncoveredTypes,
      shallow,
      deep: shallow,
      links: itemLinks,
      directDefects,
      transitiveDefects: [],
    });
  }

  const byId = new Map(results.map((r) => [r.id, r]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const isDeep = (id: string, stack: string[]): boolean => {
    const r = byId.get(id);
    if (!r) return false;
    if (!r.shallow) {
      r.deep = false;
      return false;
    }
    if (visited.has(id)) return r.deep;
    if (visiting.has(id)) {
      r.transitiveDefects.push(`cycle involving ${[...stack, id].join(" → ")}`);
      r.deep = false;
      return false;
    }
    visiting.add(id);
    let deep = true;
    for (const dep of [...r.depends, ...r.covers]) {
      if (!byId.has(dep)) continue;
      if (!isDeep(dep, [...stack, id])) deep = false;
    }
    visiting.delete(id);
    visited.add(id);
    r.deep = deep && r.shallow;
    return r.deep;
  };

  for (const r of results) isDeep(r.id, []);

  const orphans: CoverageLink[] = [];
  for (const l of rawLinks) {
    const key = `${l.filePath}:${l.line}:${l.revision}:${l.kind}`;
    if (matchedKeys.has(key)) continue;
    orphans.push(classifyLink(l, undefined, idCounts, cfg));
  }

  const gated = results.filter((r) => cfg.gateStatuses.includes(r.status));
  const directDefects = gated.reduce((n, r) => n + r.directDefects.length, 0);
  const transitiveDefects = results.reduce((n, r) => n + r.transitiveDefects.length, 0);

  return {
    schemaVersion: 1,
    generatedAt: opts.now ?? new Date().toISOString(),
    summary: {
      items: items.length,
      identified: identified.length,
      shallowCovered: results.filter((r) => r.shallow).length,
      deepCovered: results.filter((r) => r.deep).length,
      directDefects,
      transitiveDefects,
    },
    items: results,
    orphans,
  };
}

/** Exit code for a report (0 clean / no ids, 1 gated direct defects). */
export function coverageExitCode(report: CoverageReport, cfg: CoverageConfig): number {
  if (report.summary.identified === 0) return 0;
  const gated = report.items.filter((i) => cfg.gateStatuses.includes(i.status));
  const defects = gated.reduce((n, i) => n + i.directDefects.length, 0);
  return defects > 0 ? 1 : 0;
}

/** TAP-compatible summary (non-TTY / --tap). */
export function renderCoverageTap(report: CoverageReport): string {
  if (report.summary.identified === 0) {
    return [
      "1..0",
      "# no identified requirements — run: speclaw coverage --adopt",
      "ok - 0 total",
    ].join("\n");
  }
  const lines: string[] = [`1..${report.items.length}`];
  let n = 0;
  for (const item of report.items) {
    n++;
    const defects = [...item.directDefects, ...item.transitiveDefects];
    if (defects.length === 0 && item.shallow) {
      lines.push(`ok ${n} - ${item.id} (${item.coveredTypes.join(", ") || "covered"})`);
    } else {
      lines.push(`not ok ${n} - ${item.id}`);
      for (const d of defects) lines.push(`  # ${d}`);
      for (const t of item.uncoveredTypes) lines.push(`  # uncovered: ${t}`);
    }
  }
  const { directDefects, transitiveDefects } = report.summary;
  if (directDefects === 0 && transitiveDefects === 0) {
    lines.push(`ok - ${report.items.length} total`);
  } else {
    lines.push(
      `not ok - ${report.items.length} total, ${directDefects} direct, ${transitiveDefects} transitive defects`,
    );
  }
  return lines.join("\n");
}

/** Human table for TTY. */
export function renderCoverageTable(report: CoverageReport): string {
  if (report.summary.identified === 0) {
    return "No identified requirements. Run `speclaw coverage --adopt` to propose ids.";
  }
  const rows = report.items.map((i) => {
    const mark = i.shallow ? (i.deep ? "ok" : "shallow") : "MISS";
    return `${mark.padEnd(8)} ${i.id.padEnd(36)} ${(i.coveredTypes.join(",") || "-").padEnd(16)} ${i.specPath}:${i.line}`;
  });
  const s = report.summary;
  rows.push("");
  rows.push(
    `identified ${s.identified} · shallow ${s.shallowCovered} · deep ${s.deepCovered} · direct defects ${s.directDefects} · transitive ${s.transitiveDefects}`,
  );
  return rows.join("\n");
}

/** Defect-first agent text, capped (~600 tokens ≈ 2400 chars). */
export function renderCoverageAgent(report: CoverageReport, onlyDefects = true): string {
  if (report.summary.identified === 0) {
    return "No identified requirements. Next: run `speclaw coverage --adopt` then add `// Covers: req~…~1` above impl/tests.";
  }
  const items = onlyDefects
    ? report.items.filter((i) => i.directDefects.length > 0 || !i.shallow)
    : report.items;
  if (items.length === 0) {
    return `Coverage clean: ${report.summary.shallowCovered}/${report.summary.identified} shallow, ${report.summary.deepCovered} deep. Next: archive when tasks and reports are done.`;
  }
  const lines: string[] = [
    `Coverage defects: ${report.summary.directDefects} direct, ${report.summary.transitiveDefects} transitive.`,
  ];
  for (const i of items.slice(0, 12)) {
    lines.push(`- ${i.id} @ ${i.specPath}:${i.line}`);
    for (const d of i.directDefects.slice(0, 3)) lines.push(`    ${d}`);
    if (i.uncoveredTypes.length) {
      lines.push(`    add Covers for: ${i.uncoveredTypes.join(", ")}`);
    }
  }
  if (items.length > 12) lines.push(`…and ${items.length - 12} more`);
  lines.push("Next: add `// Covers: <id>` above the impl/test, reindex, re-run coverage.");
  let text = lines.join("\n");
  if (text.length > 2400) text = text.slice(0, 2397) + "...";
  return text;
}

/**
 * Archive-gate reasons for direct defects on gated statuses.
 * Opt-in: contributes nothing when the change's delta specs have zero ids.
 */
export function coverageArchiveBlockers(projectPath: string, change: string): string[] {
  const cfg = loadCoverageConfig(projectPath);
  if (!cfg.gateArchive) return [];
  const report = buildCoverageReport(projectPath, { change, cfg });
  if (report.summary.identified === 0) return [];
  const blockers: string[] = [];
  for (const item of report.items) {
    if (!cfg.gateStatuses.includes(item.status)) continue;
    for (const d of item.directDefects) blockers.push(`coverage: ${d}`);
  }
  return blockers;
}

export interface AdoptProposal {
  specPath: string;
  line: number;
  title: string;
  proposedId: string;
  collision: boolean;
}

/** Propose `req~slug~1` ids for requirements that lack them. */
export function proposeAdopt(projectPath: string): AdoptProposal[] {
  const items = loadSpecItems(projectPath);
  const used = new Set(items.filter((i) => i.idText).map((i) => i.idText!));
  const proposals: AdoptProposal[] = [];
  for (const item of items) {
    if (item.id) continue;
    const base = slugify(item.title) || "item";
    let name = base;
    let n = 2;
    let id = `req~${name}~1`;
    let collision = false;
    while (used.has(id)) {
      collision = true;
      name = `${base}-${n++}`;
      id = `req~${name}~1`;
    }
    used.add(id);
    proposals.push({
      specPath: item.specPath,
      line: item.line,
      title: item.title,
      proposedId: id,
      collision,
    });
  }
  return proposals;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Apply adopt proposals. Writes only when `write` is true; backs up to
 * `<file>.bak` before mutating.
 */
export function applyAdopt(
  projectPath: string,
  proposals: AdoptProposal[],
  opts: { write?: boolean } = {},
): { written: string[]; dryRun: boolean } {
  if (!opts.write) return { written: [], dryRun: true };

  const byFile = new Map<string, AdoptProposal[]>();
  for (const p of proposals) {
    const list = byFile.get(p.specPath) ?? [];
    list.push(p);
    byFile.set(p.specPath, list);
  }

  const written: string[] = [];
  for (const [rel, props] of byFile) {
    const abs = path.join(projectPath, rel);
    const original = fs.readFileSync(abs, "utf8");
    const lines = original.split(/\r?\n/);
    const ordered = [...props].sort((a, b) => b.line - a.line);
    for (const p of ordered) {
      const idx = p.line - 1;
      const line = lines[idx];
      if (!line || line.includes("`req~")) continue;
      lines[idx] = line.replace(
        /^(###\s+Requirement:\s*)(.+)$/,
        `$1${p.title} \`${p.proposedId}\``,
      );
    }
    fs.copyFileSync(abs, abs + ".bak");
    fs.writeFileSync(abs, lines.join("\n"));
    written.push(rel);
  }
  return { written, dryRun: false };
}

export { parseSpecItems, parseItemId, formatItemId, type SpecItem, type SpecItemId };
