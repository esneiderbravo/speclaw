import fs from "node:fs";
import path from "node:path";
import { indexExists, openDb } from "../compass/db.js";
import { explore, impact, recall } from "../compass/query.js";
import { affectedTests } from "../compass/affected.js";
import { hotspots, coupling } from "../compass/hotspots.js";
import { isGitRepo } from "../../shared/git.js";
import { lastTouch } from "../../shared/git-history.js";
import {
  frameSymbolName,
  parseStackTrace,
  type ParsedFrame,
  type UnresolvedFrame,
} from "./stack-parse.js";

export type SuspectReason =
  | "stack-frame"
  | "frame-caller"
  | "frame-callee"
  | "hotspot"
  | "temporal-coupling"
  | "semantic-match"
  | "hint-path"
  | "recently-changed";

export interface Suspect {
  name: string;
  kind: string;
  file: string;
  startLine: number;
  signature?: string;
  score: number;
  reasons: Array<{ reason: SuspectReason; weight: number; detail: string }>;
  distanceFromFrame: number | null;
  hotspotScore?: number;
  coveringTests: string[];
}

export type InvestigateDegraded =
  "no-index" | "no-hotspots" | "no-coupling" | "no-embeddings" | "no-git";

export interface InvestigateResult {
  suspects: Suspect[];
  unresolvedFrames: UnresolvedFrame[];
  degraded: InvestigateDegraded[];
  guidance: string;
  /** Echo of symptom input for draft pre-seed. */
  inputSymptom?: string;
  blastRadiusSummary?: string;
  /** Archived change dirs with matching root cause. */
  priorFixes?: string[];
}

const WEIGHTS: Record<SuspectReason, number> = {
  "stack-frame": 40,
  "frame-caller": 25,
  "frame-callee": 15,
  hotspot: 20,
  "temporal-coupling": 15,
  "semantic-match": 10,
  "hint-path": 8,
  "recently-changed": 10,
};

interface Candidate {
  name: string;
  kind: string;
  file: string;
  startLine: number;
  signature?: string;
  reasons: Suspect["reasons"];
  distanceFromFrame: number | null;
  callerCount: number;
  hotspotScore?: number;
}

function resolveAtLine(
  projectPath: string,
  file: string,
  line: number,
): { name: string; kind: string; startLine: number; signature?: string } | null {
  if (!indexExists(projectPath)) return null;
  const db = openDb(projectPath);
  try {
    const row = db
      .prepare(
        `SELECT s.name, s.kind, s.start_line AS startLine, s.signature
         FROM nodes s JOIN files f ON f.id = s.file_id
         WHERE f.path = ? AND s.start_line <= ? AND s.end_line >= ?
         ORDER BY (s.end_line - s.start_line) ASC
         LIMIT 1`,
      )
      .get(file, line, line) as
      { name: string; kind: string; startLine: number; signature: string | null } | undefined;
    if (!row) return null;
    return {
      name: row.name,
      kind: row.kind,
      startLine: row.startLine,
      signature: row.signature ?? undefined,
    };
  } finally {
    db.close();
  }
}

function callerCount(projectPath: string, name: string): number {
  if (!indexExists(projectPath)) return 0;
  const ex = explore(projectPath, name);
  return ex.callers?.length ?? 0;
}

function addCandidate(
  map: Map<string, Candidate>,
  key: string,
  c: Omit<Candidate, "reasons"> & { reason: SuspectReason; detail: string; weight?: number },
): void {
  const prev = map.get(key);
  const weight = c.weight ?? WEIGHTS[c.reason];
  const entry: Candidate = prev ?? {
    name: c.name,
    kind: c.kind,
    file: c.file,
    startLine: c.startLine,
    signature: c.signature,
    reasons: [],
    distanceFromFrame: c.distanceFromFrame,
    callerCount: c.callerCount,
    hotspotScore: c.hotspotScore,
  };
  entry.reasons.push({ reason: c.reason, weight, detail: c.detail });
  entry.callerCount = Math.max(entry.callerCount, c.callerCount);
  if (c.hotspotScore !== undefined) {
    entry.hotspotScore = Math.max(entry.hotspotScore ?? 0, c.hotspotScore);
  }
  map.set(key, entry);
}

function scoreCandidate(c: Candidate): number {
  let raw = c.reasons.reduce((s, r) => s + r.weight, 0);
  raw /= Math.log2(c.callerCount + 2);
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function scanArchivedRootCauses(projectPath: string, symbol: string): string[] {
  const archiveRoot = path.join(projectPath, "lawbook", "changes", "archive");
  if (!fs.existsSync(archiveRoot)) return [];
  const hits: string[] = [];
  for (const dir of fs.readdirSync(archiveRoot)) {
    const bugfix = path.join(archiveRoot, dir, "bugfix.md");
    if (!fs.existsSync(bugfix)) continue;
    const text = fs.readFileSync(bugfix, "utf8");
    if (text.includes(symbol)) hits.push(dir);
  }
  return hits;
}

/**
 * Rank likely bug origins from the code graph and git history.
 */
export async function investigate(args: {
  projectPath: string;
  stackTrace?: string;
  symptom?: string;
  hintPaths?: string[];
  maxSuspects?: number;
}): Promise<InvestigateResult> {
  const maxSuspects = args.maxSuspects ?? 8;
  const degraded: InvestigateDegraded[] = [];
  const hintPaths = (args.hintPaths ?? []).map((p) => p.replace(/^\.\//, ""));

  if (!args.stackTrace?.trim() && !args.symptom?.trim()) {
    throw new Error("provide stackTrace or symptom");
  }

  if (args.stackTrace?.trim()) {
    const parsed = parseStackTrace(args.projectPath, args.stackTrace);
    if (parsed.format === "unknown" && parsed.frames.length === 0 && parsed.unresolved.length > 0) {
      return {
        suspects: [],
        unresolvedFrames: parsed.unresolved,
        degraded: [],
        guidance:
          "Stack trace could not be parsed. speclaw indexes TS/JS/Python only — use `symptom` for prose triage.",
        inputSymptom: args.stackTrace.split("\n")[0],
      };
    }
  }

  if (!indexExists(args.projectPath)) {
    return {
      suspects: [],
      unresolvedFrames: [],
      degraded: ["no-index"],
      guidance:
        "No Compass index — run `speclaw index` first. Without the graph, suspects cannot be verified.",
      inputSymptom: args.symptom ?? args.stackTrace?.split("\n")[0],
    };
  }

  const candidates = new Map<string, Candidate>();
  let unresolvedFrames: UnresolvedFrame[] = [];
  let frames: ParsedFrame[] = [];

  if (args.stackTrace?.trim()) {
    const parsed = parseStackTrace(args.projectPath, args.stackTrace);
    unresolvedFrames = parsed.unresolved;
    frames = parsed.frames;
    if (parsed.format === "unknown" && parsed.frames.length === 0) {
      return {
        suspects: [],
        unresolvedFrames,
        degraded: [],
        guidance:
          "Stack trace could not be parsed. speclaw indexes TS/JS/Python only — use `symptom` for prose triage.",
        inputSymptom: args.stackTrace.split("\n")[0],
      };
    }

    frames.forEach((frame, idx) => {
      const dist = idx;
      const atLine = resolveAtLine(args.projectPath, frame.file, frame.line);
      const symName = atLine?.name ?? frameSymbolName(frame) ?? frame.fn;
      if (atLine || symName) {
        const name = atLine?.name ?? symName;
        const cc = callerCount(args.projectPath, name);
        addCandidate(candidates, `${frame.file}:${name}`, {
          name,
          kind: atLine?.kind ?? "function",
          file: frame.file,
          startLine: atLine?.startLine ?? frame.line,
          signature: atLine?.signature,
          reason: "stack-frame",
          detail: `frame at ${frame.file}:${frame.line}`,
          distanceFromFrame: dist,
          callerCount: cc,
        });

        if (symName) {
          const ex = explore(args.projectPath, name);
          if (ex.found) {
            for (const caller of ex.callers ?? []) {
              addCandidate(candidates, `${caller.file}:${caller.name}`, {
                name: caller.name,
                kind: caller.kind,
                file: caller.file,
                startLine: caller.line,
                reason: "frame-caller",
                detail: `calls ${name} from the trace`,
                distanceFromFrame: dist + 1,
                callerCount: callerCount(args.projectPath, caller.name),
              });
            }
            for (const callee of ex.callees ?? []) {
              if (!callee.file) continue;
              addCandidate(candidates, `${callee.file}:${callee.name}`, {
                name: callee.name,
                kind: "function",
                file: callee.file,
                startLine: callee.line,
                reason: "frame-callee",
                detail: `called by ${name} in the trace`,
                distanceFromFrame: dist + 1,
                callerCount: callerCount(args.projectPath, callee.name),
              });
            }
          }
        }
      }
    });
  }

  if (args.symptom?.trim() && candidates.size === 0) {
    try {
      const hits = await recall(args.projectPath, args.symptom, 15);
      for (const h of hits) {
        addCandidate(candidates, `${h.file}:${h.name}`, {
          name: h.name,
          kind: h.kind,
          file: h.file,
          startLine: h.line,
          signature: h.signature ?? undefined,
          reason: "semantic-match",
          detail: `semantic match for symptom`,
          distanceFromFrame: null,
          callerCount: callerCount(args.projectPath, h.name),
        });
      }
    } catch {
      degraded.push("no-embeddings");
    }
  }

  // Hotspots + coupling
  const files = new Set<string>([...candidates.values()].map((c) => c.file));
  for (const f of frames) files.add(f.file);
  for (const h of hintPaths) files.add(h);

  try {
    const hs = hotspots(args.projectPath, { days: 90, sortBy: "combined", limit: 200 });
    let max = 0;
    for (const h of hs.hotspots) max = Math.max(max, h.combinedScore);
    if (max <= 0) degraded.push("no-hotspots");
    else {
      const hotspotByFile = new Map(hs.hotspots.map((h) => [h.file, h.combinedScore / max]));
      for (const [file, score] of hotspotByFile) {
        if (score < 0.3) continue;
        for (const [key, c] of candidates) {
          if (c.file !== file) continue;
          addCandidate(candidates, key, {
            ...c,
            reason: "hotspot",
            detail: `hotspot score ${score.toFixed(2)} on ${file}`,
            hotspotScore: score,
          });
        }
      }
    }
  } catch {
    degraded.push("no-hotspots");
  }

  try {
    for (const file of files) {
      const co = coupling(args.projectPath, file, { limit: 5 });
      for (const p of co.partners) {
        if (p.strength < 0.2) continue;
        for (const frameFile of frames.map((f) => f.file)) {
          if (p.file === frameFile) {
            for (const [key, c] of candidates) {
              if (c.file === file) {
                addCandidate(candidates, key, {
                  ...c,
                  reason: "temporal-coupling",
                  detail: `temporally coupled to ${frameFile} (strength ${p.strength.toFixed(2)})`,
                });
              }
            }
          }
        }
      }
    }
  } catch {
    degraded.push("no-coupling");
  }

  if (isGitRepo(args.projectPath)) {
    for (const [key, c] of candidates) {
      const touch = lastTouch(args.projectPath, c.file);
      if (touch) {
        addCandidate(candidates, key, {
          ...c,
          reason: "recently-changed",
          detail: `last touched ${touch}`,
        });
      }
    }
  } else {
    degraded.push("no-git");
  }

  for (const h of hintPaths) {
    for (const [key, c] of candidates) {
      if (c.file === h || c.file.endsWith(h)) {
        addCandidate(candidates, key, {
          ...c,
          reason: "hint-path",
          detail: `matches hint path ${h}`,
        });
      }
    }
  }

  let suspects: Suspect[] = [...candidates.values()]
    .map((c) => ({
      name: c.name,
      kind: c.kind,
      file: c.file,
      startLine: c.startLine,
      signature: c.signature,
      score: scoreCandidate(c),
      reasons: c.reasons,
      distanceFromFrame: c.distanceFromFrame,
      hotspotScore: c.hotspotScore,
      coveringTests: [] as string[],
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Covering tests for top candidates
  for (const s of suspects.slice(0, 5)) {
    try {
      const at = affectedTests(args.projectPath, { files: [s.file] });
      s.coveringTests = at.tests.map((t) => t.file).slice(0, 5);
    } catch {
      /* soft */
    }
  }

  if (suspects.length > 0 && suspects.length < 3) {
    // keep all when fewer than 3
  } else if (suspects.length > maxSuspects) {
    suspects = suspects.slice(0, maxSuspects);
  }

  const top = suspects[0];
  let blastRadiusSummary: string | undefined;
  let priorFixes: string[] | undefined;
  if (top) {
    priorFixes = scanArchivedRootCauses(args.projectPath, top.name);
    try {
      const imp = impact(args.projectPath, { symbol: top.name, format: "grouped", maxDepth: 3 });
      blastRadiusSummary = `${imp.totals.nodes} node(s) in ${imp.totals.modules} module(s) reachable from ${top.name}`;
    } catch {
      blastRadiusSummary = `(run compass_impact on ${top.name})`;
    }
  }

  const guidance =
    "Treat this ranking as evidence, not a verdict — read the top suspects yourself. " +
    "Stack frames outrank graph neighbours; external/node_modules frames are excluded. " +
    (priorFixes?.length
      ? `Prior archive(s) mention this symbol: ${priorFixes.join(", ")}.`
      : "No matching archived bugfix root cause found.");

  return {
    suspects,
    unresolvedFrames,
    degraded: [...new Set(degraded)],
    guidance,
    inputSymptom: args.symptom ?? args.stackTrace?.split("\n")[0]?.trim(),
    blastRadiusSummary,
    priorFixes,
  };
}

/** Format investigate result as stable JSON text (deterministic key order). */
export function formatInvestigateResult(result: InvestigateResult): string {
  return JSON.stringify(result, null, 2);
}
