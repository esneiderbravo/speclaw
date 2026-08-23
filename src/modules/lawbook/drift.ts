/**
 * Deterministic spec↔code drift classification and reporting.
 */
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb, indexExists, needsReindex } from "../compass/db.js";
import { NORMALIZER_VERSION } from "../compass/hash.js";
import { logForPath } from "../../shared/git-history.js";
import {
  listAnchoredCapabilities,
  readAnchorsFile,
  resealAll,
  sealCapability,
  type AnchorRecord,
  type SealSummary,
} from "./anchors.js";

export type DriftState =
  | "unchanged"
  | "changed-cosmetic"
  | "changed-semantic"
  | "moved"
  | "deleted"
  | "orphan"
  | "ambiguous"
  | "unanchored"
  | "stale-hash";

export type FailOn = "none" | "cosmetic" | "semantic" | "any";

export interface AnchorVerdict {
  capability: string;
  anchor: AnchorRecord;
  state: DriftState;
  currentFile?: string;
  commitsSince?: number;
  driftDays?: number | null;
}

export interface ReverseHit {
  capability: string;
  filePath: string;
  symbolName: string;
  kind: string;
}

export interface DriftReport {
  schemaVersion: 1;
  generatedAt: string;
  normalizerVersion: number;
  needsReindex: boolean;
  summary: {
    capabilities: number;
    anchors: number;
    unchanged: number;
    changedCosmetic: number;
    changedSemantic: number;
    moved: number;
    deleted: number;
    orphan: number;
    ambiguous: number;
    unanchored: number;
    staleHash: number;
    maxDriftDays: number | null;
    failOn: FailOn;
    exitCode: number;
  };
  verdicts: AnchorVerdict[];
  reverse: { enabled: boolean; reason?: string; hits: ReverseHit[] };
  reseal?: SealSummary[];
}

interface NodeRow {
  id: number;
  name: string;
  kind: string;
  path: string;
  normHash: string | null;
  bodyHash: string | null;
}

const FAIL_RANK: Record<FailOn, number> = { none: 0, cosmetic: 1, semantic: 2, any: 3 };

function stateRank(state: DriftState): number {
  switch (state) {
    case "changed-cosmetic":
      return 1;
    case "changed-semantic":
    case "deleted":
      return 2;
    case "orphan":
    case "ambiguous":
      return 3;
    default:
      return 0;
  }
}

/** Parse `--fail-on`; defaults to semantic; null when invalid. */
export function parseFailOn(raw: unknown): FailOn | null {
  if (raw === undefined || raw === true) return "semantic";
  if (typeof raw !== "string") return null;
  if (raw === "none" || raw === "cosmetic" || raw === "semantic" || raw === "any") return raw;
  return null;
}

/** Classify one sealed anchor against the live graph. */
export function classifyAnchor(
  db: DatabaseSync,
  projectPath: string,
  capability: string,
  a: AnchorRecord,
): AnchorVerdict {
  if (a.normalizerVersion !== NORMALIZER_VERSION) {
    return { capability, anchor: a, state: "stale-hash" };
  }
  if (a.resolution === "unresolved") return { capability, anchor: a, state: "orphan" };
  if (a.resolution === "ambiguous") return { capability, anchor: a, state: "ambiguous" };

  if (a.anchorKind === "file") {
    const ok = a.filePath != null && fs.existsSync(path.join(projectPath, a.filePath));
    return { capability, anchor: a, state: ok ? "unchanged" : "deleted" };
  }

  const byName = db
    .prepare(
      `SELECT n.id AS id, n.name AS name, n.kind AS kind, f.path AS path,
              n.norm_hash AS normHash, n.body_hash AS bodyHash
         FROM nodes n JOIN files f ON f.id = n.file_id
        WHERE n.name = ?`,
    )
    .all(a.symbolName) as unknown as NodeRow[];

  if (byName.length === 0) {
    if (a.contentHash) {
      const byHash = db
        .prepare(
          `SELECT n.id AS id, n.name AS name, n.kind AS kind, f.path AS path,
                  n.norm_hash AS normHash, n.body_hash AS bodyHash
             FROM nodes n JOIN files f ON f.id = n.file_id
            WHERE n.norm_hash = ?
            LIMIT 1`,
        )
        .get(a.contentHash) as unknown as NodeRow | undefined;
      if (byHash) return { capability, anchor: a, state: "moved", currentFile: byHash.path };
    }
    return { capability, anchor: a, state: "deleted" };
  }

  const n = byName.find((m) => m.path === a.filePath) ?? (byName.length === 1 ? byName[0]! : null);
  if (!n) return { capability, anchor: a, state: "ambiguous" };

  if (n.normHash === a.contentHash) {
    if (n.path !== a.filePath) {
      return { capability, anchor: a, state: "moved", currentFile: n.path };
    }
    if (n.bodyHash !== a.rawHash) {
      return { capability, anchor: a, state: "changed-cosmetic", currentFile: n.path };
    }
    return { capability, anchor: a, state: "unchanged", currentFile: n.path };
  }
  return { capability, anchor: a, state: "changed-semantic", currentFile: n.path };
}

function attachAge(projectPath: string, v: AnchorVerdict): AnchorVerdict {
  if (v.state !== "changed-semantic" && v.state !== "deleted") return v;
  const file = v.currentFile ?? v.anchor.filePath;
  if (!file) return { ...v, driftDays: null };
  const touches = logForPath(projectPath, file);
  const last = touches[0];
  if (!last) return { ...v, commitsSince: 0, driftDays: null };
  const archived = Date.parse(v.anchor.archivedAt);
  const driftDays = Number.isFinite(archived)
    ? Math.max(0, Math.floor((last.ts * 1000 - archived) / 86_400_000))
    : null;
  return { ...v, commitsSince: touches.length, driftDays };
}

function matchGlob(relPath: string, pattern: string): boolean {
  const norm = relPath.replace(/\\/g, "/");
  const esc = pattern
    .replace(/\\/g, "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{DS}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{DS}}/g, ".*");
  return new RegExp(`^${esc}$`).test(norm);
}

/**
 * Load `capabilities[].paths` from lawbook/config.yaml (line-oriented subset).
 * Returns an empty map when the file is missing or no paths are declared.
 */
export function loadCapabilityPaths(projectPath: string): Record<string, string[]> {
  const cfgPath = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfgPath)) return {};
  const out: Record<string, string[]> = {};
  let inCaps = false;
  let current: string | null = null;
  let inPaths = false;
  for (const raw of fs.readFileSync(cfgPath, "utf8").split("\n")) {
    const line = raw.replace(/\s+#.*$/, "");
    if (/^\s*capabilities\s*:/.test(line)) {
      inCaps = true;
      current = null;
      inPaths = false;
      continue;
    }
    if (inCaps && /^[A-Za-z_]/.test(line)) {
      // Next top-level key ends the capabilities block.
      inCaps = false;
      current = null;
      inPaths = false;
    }
    if (!inCaps) continue;

    const name = /^\s*-\s*name\s*:\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
    if (name) {
      current = name[1]!.trim();
      out[current] ??= [];
      inPaths = false;
      continue;
    }
    if (/^\s*paths\s*:/.test(line)) {
      inPaths = true;
      const inline = /^\s*paths\s*:\s*\[([^\]]*)\]\s*$/.exec(line);
      if (inline && current) {
        out[current] = inline[1]!
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        inPaths = false;
      }
      continue;
    }
    if (inPaths && current) {
      const item = /^\s*-\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
      if (item) {
        out[current]!.push(item[1]!.trim());
        continue;
      }
      if (/^\s*-\s*name\s*:/.test(line) || /^[A-Za-z_]/.test(line)) {
        inPaths = false;
      }
    }
  }
  // Drop capabilities that declared no globs.
  for (const k of Object.keys(out)) {
    if (out[k]!.length === 0) delete out[k];
  }
  return out;
}

/** Reverse drift: top-level symbols under capability paths with no seal. */
export function reverseDrift(
  db: DatabaseSync,
  capabilityPaths: Record<string, string[]>,
): { enabled: boolean; reason?: string; hits: ReverseHit[] } {
  if (Object.keys(capabilityPaths).length === 0) {
    return {
      enabled: false,
      reason: "No capabilities[].paths configured — reverse drift disabled.",
      hits: [],
    };
  }
  const anchored = new Set(
    (
      db.prepare(`SELECT symbol_name AS name FROM spec_anchors`).all() as Array<{ name: string }>
    ).map((r) => r.name),
  );
  const nodes = db
    .prepare(
      `SELECT n.name AS name, n.kind AS kind, f.path AS path
         FROM nodes n JOIN files f ON f.id = n.file_id
        WHERE n.parent_id IS NULL
          AND n.kind IN ('function','class','method','interface')`,
    )
    .all() as Array<{ name: string; kind: string; path: string }>;

  const hits: ReverseHit[] = [];
  for (const [capability, globs] of Object.entries(capabilityPaths)) {
    for (const n of nodes) {
      if (anchored.has(n.name)) continue;
      if (n.path.includes(".test.") || n.path.includes("/test/")) continue;
      if (!globs.some((g) => matchGlob(n.path, g))) continue;
      hits.push({ capability, filePath: n.path, symbolName: n.name, kind: n.kind });
    }
  }
  return { enabled: true, hits };
}

export interface DriftOpts {
  capability?: string;
  failOn?: FailOn;
  reverse?: boolean;
  reseal?: boolean;
  capabilityPaths?: Record<string, string[]>;
}

function countStates(verdicts: AnchorVerdict[]) {
  const c = {
    unchanged: 0,
    changedCosmetic: 0,
    changedSemantic: 0,
    moved: 0,
    deleted: 0,
    orphan: 0,
    ambiguous: 0,
    unanchored: 0,
    staleHash: 0,
  };
  for (const v of verdicts) {
    switch (v.state) {
      case "unchanged":
        c.unchanged++;
        break;
      case "changed-cosmetic":
        c.changedCosmetic++;
        break;
      case "changed-semantic":
        c.changedSemantic++;
        break;
      case "moved":
        c.moved++;
        break;
      case "deleted":
        c.deleted++;
        break;
      case "orphan":
        c.orphan++;
        break;
      case "ambiguous":
        c.ambiguous++;
        break;
      case "unanchored":
        c.unanchored++;
        break;
      case "stale-hash":
        c.staleHash++;
        break;
    }
  }
  return c;
}

function emptyReport(
  generatedAt: string,
  failOn: FailOn,
  needs: boolean,
  exitCode: number,
): DriftReport {
  return {
    schemaVersion: 1,
    generatedAt,
    normalizerVersion: NORMALIZER_VERSION,
    needsReindex: needs,
    summary: {
      capabilities: 0,
      anchors: 0,
      unchanged: 0,
      changedCosmetic: 0,
      changedSemantic: 0,
      moved: 0,
      deleted: 0,
      orphan: 0,
      ambiguous: 0,
      unanchored: 0,
      staleHash: 0,
      maxDriftDays: null,
      failOn,
      exitCode,
    },
    verdicts: [],
    reverse: { enabled: false, hits: [] },
  };
}

/** Exit code under a fail-on threshold. */
export function driftExitCode(verdicts: AnchorVerdict[], failOn: FailOn): number {
  if (failOn === "none") return 0;
  const threshold = FAIL_RANK[failOn];
  for (const v of verdicts) {
    const rank = stateRank(v.state);
    if (rank === 0) continue;
    // orphan/ambiguous are rank 3 — they fail only under `--fail-on any`.
    // cosmetic (1) and semantic/deleted (2) fail when rank is in [threshold, 2].
    if (failOn === "any") return 1;
    if (rank >= threshold && rank <= FAIL_RANK.semantic) return 1;
  }
  return 0;
}

/** Build a full drift report. */
export function buildDriftReport(projectPath: string, opts: DriftOpts = {}): DriftReport {
  const failOn = opts.failOn ?? "semantic";
  const generatedAt = new Date().toISOString();

  if (!indexExists(projectPath)) return emptyReport(generatedAt, failOn, true, 2);

  let resealSummaries: SealSummary[] | undefined;
  if (opts.reseal) {
    if (opts.capability) {
      const specPath = path.join(projectPath, "lawbook", "specs", opts.capability, "spec.md");
      const md = fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : "";
      resealSummaries = [sealCapability(projectPath, opts.capability, md)];
    } else {
      resealSummaries = resealAll(projectPath);
    }
  }

  const db = openDb(projectPath);
  try {
    if (needsReindex(db)) return emptyReport(generatedAt, failOn, true, 2);

    const caps = opts.capability ? [opts.capability] : listAnchoredCapabilities(projectPath);
    const verdicts: AnchorVerdict[] = [];

    for (const capability of caps) {
      const file = readAnchorsFile(projectPath, capability);
      if (!file || file.anchors.length === 0) {
        verdicts.push({
          capability,
          anchor: {
            specId: capability,
            requirementId: "",
            scenarioId: "",
            anchorKind: "symbol",
            symbolName: "",
            filePath: null,
            resolution: "unresolved",
            contentHash: null,
            rawHash: null,
            archivedAt: generatedAt,
            commitSha: null,
            source: "backtick",
            normalizerVersion: NORMALIZER_VERSION,
          },
          state: "unanchored",
        });
        continue;
      }
      for (const a of file.anchors) {
        verdicts.push(attachAge(projectPath, classifyAnchor(db, projectPath, capability, a)));
      }
    }

    const reverse = opts.reverse
      ? reverseDrift(db, opts.capabilityPaths ?? loadCapabilityPaths(projectPath))
      : { enabled: false, reason: "Pass --reverse to enable.", hits: [] as ReverseHit[] };

    const counts = countStates(verdicts);
    const maxDriftDays = verdicts.reduce<number | null>((acc, v) => {
      if (v.driftDays == null) return acc;
      return acc == null ? v.driftDays : Math.max(acc, v.driftDays);
    }, null);

    return {
      schemaVersion: 1,
      generatedAt,
      normalizerVersion: NORMALIZER_VERSION,
      needsReindex: false,
      summary: {
        capabilities: caps.length,
        anchors: verdicts.filter((v) => v.state !== "unanchored").length,
        ...counts,
        maxDriftDays,
        failOn,
        exitCode: driftExitCode(verdicts, failOn),
      },
      verdicts,
      reverse,
      reseal: resealSummaries,
    };
  } finally {
    db.close();
  }
}

/** Human TTY table. */
export function renderDriftTable(report: DriftReport): string {
  const s = report.summary;
  const lines = [
    `speclaw drift · ${s.capabilities} capabilities · ${s.anchors} anchors`,
    "",
    `unchanged ${s.unchanged}  cosmetic ${s.changedCosmetic}  moved ${s.moved}  semantic ${s.changedSemantic}  deleted ${s.deleted}  orphan ${s.orphan}  ambiguous ${s.ambiguous}`,
  ];
  const defects = report.verdicts.filter((v) => stateRank(v.state) >= 2);
  if (defects.length) {
    lines.push("");
    for (const d of defects.slice(0, 30)) {
      lines.push(
        `  ${d.state.padEnd(18)} ${d.capability} → ${d.anchor.symbolName || "(unanchored)"}` +
          (d.currentFile ? `  ${d.currentFile}` : ""),
      );
    }
    if (defects.length > 30) lines.push(`  … ${defects.length - 30} more`);
  }
  if (report.reverse.enabled && report.reverse.hits.length) {
    lines.push("", `reverse · ${report.reverse.hits.length} uncovered symbol(s)`);
    for (const h of report.reverse.hits.slice(0, 15)) {
      lines.push(`  ${h.capability}  ${h.filePath}  ${h.symbolName}`);
    }
  } else if (report.reverse.reason) {
    lines.push("", report.reverse.reason);
  }
  return lines.join("\n");
}

/** Bounded agent summary. */
export function renderDriftAgent(report: DriftReport, maxItems = 10): string {
  if (report.needsReindex) {
    return "Drift: index needs rebuild (`speclaw index`) before comparison.";
  }
  const s = report.summary;
  const defects = report.verdicts.filter((v) => stateRank(v.state) >= 2);
  if (defects.length === 0 && s.anchors > 0) {
    return `Drift clean — ${s.anchors} anchors across ${s.capabilities} capabilities (fail-on ${s.failOn}).`;
  }
  if (s.anchors === 0) {
    return "Drift: no sealed anchors yet. Run `speclaw drift --reseal` after indexing.";
  }
  const lines = [
    `Drift: ${defects.length} defect(s) · semantic ${s.changedSemantic} · deleted ${s.deleted} · orphan ${s.orphan} (fail-on ${s.failOn}).`,
  ];
  for (const d of defects.slice(0, maxItems)) {
    lines.push(`- [${d.state}] ${d.capability} ${d.anchor.symbolName}`);
  }
  if (defects.length > maxItems) lines.push(`- … ${defects.length - maxItems} more`);
  lines.push("Use `speclaw drift --json` for detail.");
  return lines.join("\n");
}

/** Semantic/deleted findings for verify --ci. */
export function driftFindingsForVerify(projectPath: string): Array<{
  ruleId: string;
  file: string;
  line: number;
  message: string;
  severity: "error";
}> {
  const report = buildDriftReport(projectPath, { failOn: "semantic" });
  const out: Array<{
    ruleId: string;
    file: string;
    line: number;
    message: string;
    severity: "error";
  }> = [];
  for (const v of report.verdicts) {
    if (v.state !== "changed-semantic" && v.state !== "deleted") continue;
    out.push({
      ruleId: `drift~${v.state}`,
      file: v.currentFile ?? v.anchor.filePath ?? "lawbook/anchors",
      line: 1,
      message: `Spec drift (${v.state}): ${v.capability} → ${v.anchor.symbolName}`,
      severity: "error",
    });
  }
  return out;
}

/** Doctor check line. */
export function doctorDriftCheck(projectPath: string): {
  id: string;
  title: string;
  status: "ok" | "warn" | "error" | "skip";
  detail: string;
  remedy?: string;
} {
  const caps = listAnchoredCapabilities(projectPath);
  if (caps.length === 0) {
    return {
      id: "cfg.drift",
      title: "spec drift",
      status: "skip",
      detail: "no sealed anchors",
      remedy: "speclaw drift --reseal",
    };
  }
  if (!indexExists(projectPath)) {
    return {
      id: "cfg.drift",
      title: "spec drift",
      status: "warn",
      detail: "index missing",
      remedy: "speclaw index",
    };
  }
  const report = buildDriftReport(projectPath, { failOn: "semantic" });
  if (report.needsReindex) {
    return {
      id: "cfg.drift",
      title: "spec drift",
      status: "warn",
      detail: "index needs rebuild before drift can run",
      remedy: "speclaw index",
    };
  }
  const bad = report.summary.changedSemantic + report.summary.deleted;
  if (bad > 0) {
    return {
      id: "cfg.drift",
      title: "spec drift",
      status: "warn",
      detail: `${bad} semantic/deleted across ${report.summary.anchors} anchors`,
      remedy: "speclaw drift",
    };
  }
  return {
    id: "cfg.drift",
    title: "spec drift",
    status: "ok",
    detail: `${report.summary.anchors} anchors · clean`,
  };
}
