import fs from "node:fs";
import path from "node:path";
import { indexExists } from "../compass/db.js";
import { explore } from "../compass/query.js";
import { impact } from "../compass/query.js";
import { affectedTests } from "../compass/affected.js";
import { hotspots } from "../compass/hotspots.js";
import { loadAffectedConfig, matchGlob } from "../compass/affected-config.js";
import { inferModule } from "../compass/affected-config.js";

/** Confirmed / proposed ceremony level. */
export type CeremonyLevel = 0 | 1 | 2 | 3;

export type CeremonyDegraded = "no-index" | "no-git" | "unresolved-symbols" | "no-hotspots";

/** Explicit targets for a level proposal. */
export interface CeremonyTargets {
  paths: string[];
  symbols: string[];
}

export interface CeremonySignals {
  filesTouched: number;
  modulesTouched: number;
  blastRadiusNodes: number;
  affectedTests: number;
  touchesPublicApi: boolean;
  /** 0..1 pressure from hotspots among touched files (max combinedScore / floor). */
  maxHotspotScore: number;
  touchesGlobalFile: boolean;
  onlyDocs: boolean;
  degraded: CeremonyDegraded[];
}

export interface LevelThresholds {
  filesTouched: [number, number, number, number];
  modulesTouched: [number, number, number, number];
  affectedTests: [number, number, number, number];
  blastRadiusNodes: [number, number, number, number];
  publicApi: number;
  globalFile: number;
  hotspot: number;
  hotspotFloor: number;
  cuts: [number, number, number];
  globalGlobs: string[];
  docGlobs: string[];
  moduleRoots: string[];
}

export interface CeremonyProposal {
  /** Omitted when degraded with no safe proposal. */
  level: CeremonyLevel | null;
  score: number;
  signals: CeremonySignals;
  rationale: string;
  degraded: CeremonyDegraded[];
}

export interface CeremonyRecord extends CeremonyProposal {
  confirmedLevel: CeremonyLevel;
  confirmedBy: "human" | "config-default" | "agent-forced";
  confirmedAt: string;
  overrideReason?: string;
  promotions: Array<{
    from: CeremonyLevel;
    to: CeremonyLevel;
    at: string;
    reason: string;
  }>;
}

/** Default thresholds from the adaptive-ceremony roadmap. */
export const DEFAULT_THRESHOLDS: LevelThresholds = {
  filesTouched: [0, 1, 3, 5],
  modulesTouched: [0, 2, 4, 6],
  affectedTests: [0, 1, 2, 4],
  blastRadiusNodes: [0, 1, 3, 5],
  publicApi: 4,
  globalFile: 5,
  hotspot: 3,
  hotspotFloor: 0.7,
  cuts: [3, 8, 15],
  globalGlobs: [
    "package.json",
    "package-lock.json",
    "tsconfig*.json",
    ".github/workflows/**",
    "src/modules/compass/db.ts",
    "lawbook/config.yaml",
  ],
  docGlobs: ["**/*.md", "docs/**", "assets/**"],
  moduleRoots: ["src"],
};

const BUCKETS = {
  filesTouched: [1, 3, 10, Infinity],
  modulesTouched: [1, 2, 4, Infinity],
  affectedTests: [0, 3, 15, Infinity],
  blastRadiusNodes: [2, 10, 50, Infinity],
} as const;

/** Which artifacts a confirmed level requires. */
export interface ArtifactNeeds {
  record: boolean;
  proposal: boolean;
  design: boolean;
  /** Standalone tasks.md (false at level 0 — checklist lives in record.md). */
  tasksFile: boolean;
  deltaSpecs: boolean;
  reports: boolean;
  /** At level 2, design may be omitted only with justification in record. */
  designOptionalWithJustification: boolean;
}

export function artifactNeeds(level: CeremonyLevel): ArtifactNeeds {
  switch (level) {
    case 0:
      return {
        record: true,
        proposal: false,
        design: false,
        tasksFile: false,
        deltaSpecs: false,
        reports: true,
        designOptionalWithJustification: false,
      };
    case 1:
      return {
        record: true,
        proposal: false,
        design: false,
        tasksFile: true,
        deltaSpecs: true,
        reports: true,
        designOptionalWithJustification: false,
      };
    case 2:
      return {
        record: false,
        proposal: true,
        design: false,
        tasksFile: true,
        deltaSpecs: true,
        reports: true,
        designOptionalWithJustification: true,
      };
    case 3:
      return {
        record: false,
        proposal: true,
        design: true,
        tasksFile: true,
        deltaSpecs: true,
        reports: true,
        designOptionalWithJustification: false,
      };
  }
}

function bucketPoints(
  value: number,
  edges: readonly number[],
  points: [number, number, number, number],
): number {
  const i = edges.findIndex((max) => value <= max);
  return points[i < 0 ? 3 : i]!;
}

/** Pure scoring; `onlyDocs` short-circuits to 0. */
export function scoreSignals(s: CeremonySignals, t: LevelThresholds = DEFAULT_THRESHOLDS): number {
  if (s.onlyDocs) return 0;
  let score = 0;
  score += bucketPoints(s.filesTouched, BUCKETS.filesTouched, t.filesTouched);
  score += bucketPoints(s.modulesTouched, BUCKETS.modulesTouched, t.modulesTouched);
  score += bucketPoints(s.affectedTests, BUCKETS.affectedTests, t.affectedTests);
  score += bucketPoints(s.blastRadiusNodes, BUCKETS.blastRadiusNodes, t.blastRadiusNodes);
  if (s.touchesPublicApi) score += t.publicApi;
  if (s.touchesGlobalFile) score += t.globalFile;
  if (s.maxHotspotScore >= t.hotspotFloor) score += t.hotspot;
  return score;
}

export function levelFromScore(
  score: number,
  cuts: [number, number, number] = DEFAULT_THRESHOLDS.cuts,
): CeremonyLevel {
  if (score < cuts[0]) return 0;
  if (score < cuts[1]) return 1;
  if (score < cuts[2]) return 2;
  return 3;
}

export function explain(
  s: CeremonySignals,
  t: LevelThresholds,
  score: number,
  level: CeremonyLevel | null,
): string {
  const parts = [
    `${s.filesTouched} file(s)`,
    `${s.modulesTouched} module(s)`,
    `${s.affectedTests} affected test(s)`,
    `${s.blastRadiusNodes} blast node(s)`,
    s.touchesPublicApi ? "public API" : "no public API",
    s.touchesGlobalFile ? "global file" : "no global file",
    `hotspot=${s.maxHotspotScore.toFixed(2)}`,
  ];
  if (s.onlyDocs) parts.push("docs-only");
  if (s.degraded.length) parts.push(`degraded:[${s.degraded.join(",")}]`);
  const lvl = level === null ? "none" : String(level);
  return `${parts.join(", ")} → score ${score} → level ${lvl} (cuts ${t.cuts.join("/")})`;
}

export function proposeLevel(
  s: CeremonySignals,
  t: LevelThresholds = DEFAULT_THRESHOLDS,
): CeremonyProposal {
  if (s.degraded.includes("no-index") && s.filesTouched === 0 && s.blastRadiusNodes === 0) {
    return {
      level: null,
      score: 0,
      signals: s,
      rationale: explain(s, t, 0, null),
      degraded: s.degraded,
    };
  }
  if (
    s.filesTouched === 0 &&
    s.blastRadiusNodes === 0 &&
    s.degraded.includes("unresolved-symbols")
  ) {
    return {
      level: null,
      score: 0,
      signals: s,
      rationale: explain(s, t, 0, null),
      degraded: s.degraded,
    };
  }
  const score = scoreSignals(s, t);
  const level = levelFromScore(score, t.cuts);
  return {
    level,
    score,
    signals: s,
    rationale: explain(s, t, score, level),
    degraded: s.degraded,
  };
}

function matchesAny(rel: string, globs: string[]): boolean {
  const norm = rel.split("\\").join("/");
  return globs.some((g) => matchGlob(norm, g));
}

function isSpecPath(rel: string): boolean {
  const n = rel.split("\\").join("/");
  return n.startsWith("lawbook/specs/") || n.includes("/lawbook/specs/");
}

/** Resolve modules for paths using configured roots / inferModule. */
export function countModules(paths: string[]): number {
  const mods = new Set(
    paths.map((p) => inferModule(p.split("\\").join("/")) || p.split("/")[0] || p),
  );
  return mods.size;
}

/**
 * Build signals from an explicit target list. When the Compass index is missing,
 * marks `no-index` and does not invent a small blast radius.
 */
export function gatherSignals(
  projectPath: string,
  targets: CeremonyTargets,
  t: LevelThresholds = DEFAULT_THRESHOLDS,
): CeremonySignals {
  const degraded: CeremonyDegraded[] = [];
  const paths = new Set(targets.paths.map((p) => p.replace(/^\.\//, "").split("\\").join("/")));

  if (!indexExists(projectPath)) {
    degraded.push("no-index");
  } else {
    for (const sym of targets.symbols) {
      const ex = explore(projectPath, sym);
      if (ex.found && ex.symbol?.file) paths.add(ex.symbol.file.split("\\").join("/"));
      else degraded.push("unresolved-symbols");
    }
  }

  const pathList = [...paths];
  const onlyDocs =
    pathList.length > 0 &&
    pathList.every((p) => matchesAny(p, t.docGlobs)) &&
    !pathList.some(isSpecPath);

  let touchesGlobalFile = pathList.some((p) => matchesAny(p, t.globalGlobs));
  try {
    const cfg = loadAffectedConfig(projectPath);
    if (pathList.some((p) => cfg.globalFiles.some((g) => matchGlob(p, g)))) {
      touchesGlobalFile = true;
    }
  } catch {
    /* soft */
  }

  let blastRadiusNodes = 0;
  let affected = 0;
  let touchesPublicApi = false;
  let maxHotspotScore = 0;

  if (indexExists(projectPath) && pathList.length > 0) {
    try {
      const imp = impact(projectPath, { files: pathList, format: "grouped", maxDepth: 4 });
      blastRadiusNodes = imp.totals.nodes;
      if (imp.global) touchesGlobalFile = true;
    } catch {
      /* soft */
    }
    try {
      const at = affectedTests(projectPath, { files: pathList });
      affected = at.mode === "all" ? Math.max(at.tests.length, 50) : at.tests.length;
    } catch {
      /* soft */
    }
    try {
      const pkgPath = path.join(projectPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          main?: string;
          bin?: string | Record<string, string>;
        };
        const entries = new Set<string>();
        if (typeof pkg.main === "string") entries.add(pkg.main.replace(/^\.\//, ""));
        if (typeof pkg.bin === "string") entries.add(pkg.bin.replace(/^\.\//, ""));
        else if (pkg.bin && typeof pkg.bin === "object") {
          for (const v of Object.values(pkg.bin)) entries.add(String(v).replace(/^\.\//, ""));
        }
        for (const e of entries) {
          if (pathList.some((p) => p === e || e.endsWith(p) || p.endsWith(e))) {
            touchesPublicApi = true;
          }
        }
        if (pathList.some((p) => p === "src/cli/index.ts" || p === "src/server.ts")) {
          touchesPublicApi = true;
        }
      }
    } catch {
      /* soft */
    }
    try {
      const hs = hotspots(projectPath, { days: 90, sortBy: "combined", limit: 200 });
      const byFile = new Map(hs.hotspots.map((h) => [h.file, h.combinedScore]));
      let maxCombined = 0;
      for (const h of hs.hotspots) maxCombined = Math.max(maxCombined, h.combinedScore);
      if (maxCombined <= 0) degraded.push("no-hotspots");
      else {
        for (const p of pathList) {
          const c = byFile.get(p) ?? 0;
          maxHotspotScore = Math.max(maxHotspotScore, c / maxCombined);
        }
      }
    } catch {
      degraded.push("no-hotspots");
    }
  }

  return {
    filesTouched: pathList.length,
    modulesTouched: pathList.length ? countModules(pathList) : 0,
    blastRadiusNodes,
    affectedTests: affected,
    touchesPublicApi,
    maxHotspotScore,
    touchesGlobalFile,
    onlyDocs,
    degraded: [...new Set(degraded)],
  };
}

/** Load ceremony thresholds from lawbook/config.yaml (line-oriented). */
export function loadCeremonyConfig(projectPath: string): {
  thresholds: LevelThresholds;
  invalidCuts: boolean;
} {
  const thresholds = structuredClone(DEFAULT_THRESHOLDS);
  const cfgPath = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfgPath)) return { thresholds, invalidCuts: false };
  const text = fs.readFileSync(cfgPath, "utf8");
  const cuts = /^\s*cuts\s*:\s*\[([^\]]*)\]\s*$/im.exec(text);
  let invalidCuts = false;
  if (cuts) {
    const nums = cuts[1]!
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 3 && nums[0]! < nums[1]! && nums[1]! < nums[2]!) {
      thresholds.cuts = [nums[0]!, nums[1]!, nums[2]!];
    } else {
      invalidCuts = true;
    }
  }
  const floor = /^\s*hotspotFloor\s*:\s*([0-9.]+)\s*$/im.exec(text);
  if (floor) thresholds.hotspotFloor = Number(floor[1]);
  return { thresholds, invalidCuts };
}

export function changeJsonPath(projectPath: string, change: string): string {
  return path.join(projectPath, "lawbook", "changes", change, "change.json");
}

export function readCeremonyRecord(projectPath: string, change: string): CeremonyRecord | null {
  const p = changeJsonPath(projectPath, change);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CeremonyRecord;
  } catch {
    return null;
  }
}

/** Confirmed level, or 3 when change.json is missing. */
export function confirmedLevel(projectPath: string, change: string): CeremonyLevel {
  return readCeremonyRecord(projectPath, change)?.confirmedLevel ?? 3;
}

export function writeCeremonyRecord(
  projectPath: string,
  change: string,
  record: CeremonyRecord,
): void {
  const p = changeJsonPath(projectPath, change);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(record, null, 2) + "\n");
}

export function setCeremonyLevel(
  projectPath: string,
  change: string,
  opts: {
    proposal: CeremonyProposal;
    level: CeremonyLevel;
    confirmedBy: CeremonyRecord["confirmedBy"];
    reason?: string;
  },
): CeremonyRecord {
  const proposed = opts.proposal.level;
  if (proposed !== null && opts.level < proposed && !opts.reason) {
    throw new Error(`mode 'set' to a lower level than proposed (${proposed}) requires 'reason'`);
  }
  const prev = readCeremonyRecord(projectPath, change);
  const record: CeremonyRecord = {
    ...opts.proposal,
    confirmedLevel: opts.level,
    confirmedBy: opts.confirmedBy,
    confirmedAt: new Date().toISOString(),
    overrideReason: opts.reason,
    promotions: prev?.promotions ?? [],
  };
  writeCeremonyRecord(projectPath, change, record);
  return record;
}

export function promoteCeremonyLevel(
  projectPath: string,
  change: string,
  to: CeremonyLevel,
  reason: string,
): CeremonyRecord {
  const prev = readCeremonyRecord(projectPath, change);
  if (!prev) throw new Error(`change "${change}" has no change.json to promote`);
  if (to <= prev.confirmedLevel) {
    throw new Error(`promote requires a higher level than ${prev.confirmedLevel}`);
  }
  const record: CeremonyRecord = {
    ...prev,
    confirmedLevel: to,
    confirmedAt: new Date().toISOString(),
    promotions: [
      ...prev.promotions,
      { from: prev.confirmedLevel, to, at: new Date().toISOString(), reason },
    ],
  };
  writeCeremonyRecord(projectPath, change, record);
  scaffoldArtifactsForLevel(projectPath, change, to);
  return record;
}

/**
 * Create missing higher-level artifacts when promoting. Never deletes `record.md`.
 * Seeds `proposal.md` / `tasks.md` from `record.md` when present.
 */
export function scaffoldArtifactsForLevel(
  projectPath: string,
  change: string,
  level: CeremonyLevel,
): void {
  const changeDir = path.join(projectPath, "lawbook", "changes", change);
  if (!fs.existsSync(changeDir)) return;
  const needs = artifactNeeds(level);
  const recordPath = path.join(changeDir, "record.md");
  const recordText = fs.existsSync(recordPath) ? fs.readFileSync(recordPath, "utf8") : "";
  const ensure = (rel: string, content: string) => {
    const abs = path.join(changeDir, rel);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  };
  if (needs.proposal) {
    ensure(
      "proposal.md",
      `# ${change}\n\n## Why\n\n${extractWhy(recordText) || "(promoted — fill in why)"}\n\n## What\n\n(promoted from level ${level})\n`,
    );
  }
  if (needs.design && !needs.designOptionalWithJustification) {
    ensure("design.md", `# Design — ${change}\n\n## Approach\n\n(promoted — fill in)\n`);
  }
  if (needs.tasksFile) {
    const steps = extractChecklist(recordText);
    ensure(
      "tasks.md",
      steps.length
        ? steps.map((s) => `- [ ] ${s}`).join("\n") + "\n"
        : `- [ ] Implement\n- [ ] Add or update tests\n- [ ] Write discipline report under reports/\n`,
    );
  }
  ensure(
    "reports/README.md",
    `# Reports — ${change}\n\nAdd at least one discipline report before archive.\n`,
  );
}

function extractWhy(recordMd: string): string {
  const m = /\*\*Why:\*\*\s*(.+)/i.exec(recordMd);
  return m?.[1]?.trim() ?? "";
}

function extractChecklist(recordMd: string): string[] {
  const out: string[] = [];
  for (const line of recordMd.split("\n")) {
    const m = /^\s*[-*]\s+\[[ xX]\]\s+(.+)$/.exec(line);
    if (m) out.push(m[1]!.trim());
  }
  return out;
}

/** Count unchecked `- [ ]` tasks in markdown (tasks.md or record.md Steps). */
export function countUncheckedTasks(markdown: string): number {
  return (markdown.match(/^\s*[-*]\s+\[ \]/gm) ?? []).length;
}

export function hasDisciplineReport(changeDir: string): boolean {
  const reportsDir = path.join(changeDir, "reports");
  if (!fs.existsSync(reportsDir)) return false;
  return fs
    .readdirSync(reportsDir)
    .some((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md");
}
