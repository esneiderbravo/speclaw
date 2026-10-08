import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { changedFiles, isGitRepo, mergeBase, worktreeChangedFiles } from "../../shared/git.js";
import { handleHarness, readHarness } from "../cortex/harness.js";
import { specArchive, specArchivePreconditions } from "./engine.js";
import { confirmedLevel } from "./levels.js";
import { scaffoldQuick } from "./quick.js";

/** One quality gate run by {@link shipChange}. */
export interface ShipGate {
  command: string;
  exitCode: number;
  durationMs: number;
  /** Last lines of combined stdout/stderr, for the report. */
  tail: string;
}

/** Wall-clock of each ship phase, in milliseconds. */
export interface ShipTimings {
  scaffold: number;
  gates: number;
  report: number;
  archive: number;
  /** speclaw's own overhead: everything except the gates. */
  overhead: number;
  total: number;
}

export interface ShipResult {
  change: string;
  /** Every gate exited 0. */
  gatesPassed: boolean;
  gates: ShipGate[];
  files: string[];
  report: string;
  /** Archive destination; null when not archived (see `next`). */
  archivedTo: string | null;
  /** What still has to happen, e.g. human review on the PR for level 1+. */
  next: string[];
  timings: ShipTimings;
}

export interface ShipOptions {
  /** 1–5 line summary written into record.md; defaults to the changed-file list. */
  summary?: string;
  /** Gate commands; default: `ship.gates` in lawbook/config.yaml, else package.json scripts. */
  gates?: string[];
  /** Report file name (`<discipline>.md`); default `ship.discipline` or `change`. */
  discipline?: string;
  /** Archive date prefix (YYYY-MM-DD); default today. */
  date?: string;
  /** Run gates and write the report but do not archive. */
  noArchive?: boolean;
}

const GATE_TAIL_LINES = 12;

/**
 * Read the `ship:` block of lawbook/config.yaml (line-oriented, like the other
 * config readers): `gates: [...]` and `discipline: <name>`.
 *
 * @param projectPath - Project root.
 * @returns The configured gates and discipline, each undefined when absent.
 */
export function readShipConfig(projectPath: string): { gates?: string[]; discipline?: string } {
  const cfg = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfg)) return {};
  const out: { gates?: string[]; discipline?: string } = {};
  let inShip = false;
  for (const line of fs.readFileSync(cfg, "utf8").split("\n")) {
    if (/^ship:\s*$/.test(line)) {
      inShip = true;
      continue;
    }
    if (inShip && /^\S/.test(line)) break;
    if (!inShip) continue;
    const g = /^\s+gates:\s*\[(.*)\]\s*$/.exec(line);
    if (g) {
      out.gates = g[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    const d = /^\s+discipline:\s*["']?([\w-]+)["']?\s*$/.exec(line);
    if (d) out.discipline = d[1];
  }
  return out;
}

/**
 * Default gates: the project's own `check`, `lint`, `build` and `test`
 * package.json scripts, in that order, when present.
 *
 * @param projectPath - Project root.
 * @returns npm commands for the scripts that exist (empty when none).
 */
export function detectGates(projectPath: string): string[] {
  const pkg = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkg)) return [];
  const scripts = (JSON.parse(fs.readFileSync(pkg, "utf8")) as { scripts?: Record<string, string> })
    .scripts;
  if (!scripts) return [];
  const picked = ["check", "lint", "build", "test"].filter((s) => s in scripts);
  // `check` usually already runs lint; avoid running it twice.
  const deduped = picked.includes("check") ? picked.filter((s) => s !== "lint") : picked;
  return deduped.map((s) => (s === "test" ? "npm test" : `npm run ${s}`));
}

function runGate(projectPath: string, command: string): ShipGate {
  const start = Date.now();
  const r = spawnSync(command, { cwd: projectPath, shell: true, encoding: "utf8" });
  const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd().split("\n");
  return {
    command,
    exitCode: r.status ?? 1,
    durationMs: Date.now() - start,
    tail: combined.slice(-GATE_TAIL_LINES).join("\n"),
  };
}

function branchFiles(projectPath: string): string[] {
  if (!isGitRepo(projectPath)) return [];
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  const committed = base ? changedFiles(projectPath, base) : [];
  return [
    ...new Set([
      ...committed,
      ...worktreeChangedFiles(projectPath),
      ...untrackedFiles(projectPath),
    ]),
  ]
    .filter((f) => !f.startsWith("lawbook/changes/"))
    .sort();
}

/** New files not yet added, outside ship's own output (`lawbook/changes/`, `.speclaw/`). */
function untrackedFiles(projectPath: string): string[] {
  return git(projectPath, [
    "-c",
    "core.quotePath=false",
    "ls-files",
    "--others",
    "--exclude-standard",
  ])
    .split("\n")
    .filter((f) => f && !f.startsWith("lawbook/changes/") && !f.startsWith(".speclaw/"));
}

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function renderReport(
  change: string,
  discipline: string,
  files: string[],
  gates: ShipGate[],
  passed: boolean,
  date: string,
): string {
  const rows = gates
    .map(
      (g) =>
        `| \`${g.command}\` | ${g.exitCode === 0 ? "pass" : `FAIL (exit ${g.exitCode})`} | ${secs(g.durationMs)} |`,
    )
    .join("\n");
  const outputs = gates
    .map((g) => `### \`${g.command}\`\n\n\`\`\`text\n${g.tail}\n\`\`\``)
    .join("\n\n");
  return `# ${discipline} report — ${change}

**Discipline:** ${discipline} · **Change:** ${change} · **Date:** ${date} · **Generated by:** \`speclaw ship\` from real gate output

## Gates and results

| Check | Result | Time |
|-------|--------|------|
${rows || "| (no gates configured) | — | — |"}

## Files changed

${files.length ? files.map((f) => `- \`${f}\``).join("\n") : "- (none detected)"}

## Gate output (tail)

${outputs || "No gate output."}

## Pre-existing failures

None recorded.

## Pending manual steps

None.

## Verdict

${passed ? "**Gates PASS** — every gate exited 0. Review is not decided here: it happens on the PR." : "**Gates FAIL** — at least one gate failed; nothing was archived."}
`;
}

/**
 * The archived folder of a change (`lawbook/changes/archive/<date>-<name>`),
 * newest first, or null.
 */
function findArchived(projectPath: string, name: string): string | null {
  const dir = path.join(projectPath, "lawbook", "changes", "archive");
  if (!fs.existsSync(dir)) return null;
  const hit = fs
    .readdirSync(dir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d) && d.slice(11) === name)
    .sort()
    .pop();
  return hit ? path.join("lawbook", "changes", "archive", hit) : null;
}

function fillRecord(recordPath: string, summary: string): void {
  if (!fs.existsSync(recordPath)) return;
  const body = fs
    .readFileSync(recordPath, "utf8")
    .replace("<!-- 2–5 lines: what and why. -->", summary)
    .replace(/^- \[ \] /gm, "- [x] ");
  fs.writeFileSync(recordPath, body);
}

/**
 * Record the test verdict derived from gate exit codes. Ship never records a
 * review verdict: review belongs to a reviewer or the PR, never to the tool
 * that produced the change. Stage moves are plain transitions; the only
 * verdict written is the one at `testing`, and only from passing gates.
 */
function recordGateVerdict(projectPath: string, change: string): void {
  if (!readHarness(projectPath, change)) {
    handleHarness({ projectPath, change, harnessOp: "start" });
  }
  for (let i = 0; i < 4; i++) {
    const state = readHarness(projectPath, change);
    if (
      !state ||
      (state.stage !== "exploring" && state.stage !== "implementing" && state.stage !== "testing")
    ) {
      return;
    }
    handleHarness({
      projectPath,
      change,
      harnessOp: "advance",
      verdict: state.stage === "testing" ? "PASS" : undefined,
    });
  }
}

/**
 * Fast path for finished work, in one call: scaffold a level-0 record when the
 * change does not exist, run the project's gates once, and write a discipline
 * report from their real output. At level 0 passing gates are the whole
 * verification, so the change is archived. At level 1+ ship stops after the
 * evidence: review is a human (or reviewer-role) decision taken on the PR, and
 * the archive follows it.
 *
 * @param projectPath - Project root with `lawbook/`.
 * @param name - Change name (kebab-case).
 * @param opts - Summary, gates, discipline, date, and `noArchive`.
 * @returns Gate results, the report path, the archive destination, next steps, and timings.
 */
export function shipChange(projectPath: string, name: string, opts: ShipOptions = {}): ShipResult {
  const t0 = Date.now();
  const cfg = readShipConfig(projectPath);
  const discipline = opts.discipline ?? cfg.discipline ?? "change";
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const changeDir = path.join(projectPath, "lawbook", "changes", name);
  const files = branchFiles(projectPath);

  const archived = findArchived(projectPath, name);
  if (!fs.existsSync(changeDir) && !archived) {
    scaffoldQuick(projectPath, name, { paths: [], symbols: [] });
  }
  const summary =
    opts.summary ??
    (files.length
      ? `Changed ${files.length} file(s): ${files.slice(0, 8).join(", ")}${files.length > 8 ? ", …" : ""}`
      : "No file changes detected.");
  fillRecord(path.join(changeDir, "record.md"), summary);
  const t1 = Date.now();

  const commands = opts.gates ?? cfg.gates ?? detectGates(projectPath);
  const gates: ShipGate[] = [];
  for (const command of commands) {
    const g = runGate(projectPath, command);
    gates.push(g);
    if (g.exitCode !== 0) break;
  }
  const gatesPassed = gates.every((g) => g.exitCode === 0);
  const t2 = Date.now();

  const reportRel = path.join(
    archived && !fs.existsSync(changeDir) ? archived : path.join("lawbook", "changes", name),
    "reports",
    `${discipline}.md`,
  );
  fs.mkdirSync(path.dirname(path.join(projectPath, reportRel)), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, reportRel),
    renderReport(name, discipline, files, gates, gatesPassed, date),
  );
  const t3 = Date.now();

  let archivedTo: string | null = null;
  const next: string[] = [];
  const level = confirmedLevel(projectPath, name);
  if (!gatesPassed) {
    next.push(`fix the failing gate: ${gates[gates.length - 1].command}`);
  } else if (archived && !fs.existsSync(changeDir)) {
    // Already archived on this branch: the refreshed report is the update.
    archivedTo = archived;
  } else if (level !== 0) {
    next.push(
      `level ${level ?? "unconfirmed"}: open the PR — review happens there; archive after approval`,
    );
  } else if (!opts.noArchive) {
    recordGateVerdict(projectPath, name);
    const pre = specArchivePreconditions(projectPath, name);
    if (pre.length) next.push(...pre);
    else archivedTo = specArchive(projectPath, name, date).archivedTo;
  }
  if (gatesPassed && isGitRepo(projectPath)) markShipped(projectPath, name);
  const t4 = Date.now();

  const gatesMs = t2 - t1;
  return {
    change: name,
    gatesPassed,
    gates,
    files,
    report: reportRel,
    archivedTo,
    next,
    timings: {
      scaffold: t1 - t0,
      gates: gatesMs,
      report: t3 - t2,
      archive: t4 - t3,
      overhead: t4 - t0 - gatesMs,
      total: t4 - t0,
    },
  };
}

/** Outcome of {@link shipOnStop}: why it skipped, or the ship result. */
export type ShipOnStopResult =
  | { skipped: "not-git" | "base-branch" | "no-changes" | "unchanged-since-last-ship" }
  | { skipped: null; change: string; result: ShipResult };

/**
 * Change name for a branch: the part after the last `/`, kebab-cased
 * (`fix/compass-query-output` → `compass-query-output`).
 *
 * @param branch - Git branch name.
 * @returns The change name.
 */
export function changeNameForBranch(branch: string): string {
  return (
    branch
      .split("/")
      .pop()!
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "change"
  );
}

function git(projectPath: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd: projectPath, encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}

/** The last shipped work; a manual ship and the hook share it. */
const SHIP_MARKER = path.join(".speclaw", "ship-last");

/** What the last ship recorded: where, under which change name, and the work's fingerprint. */
interface ShipMarker {
  branch: string;
  change: string;
  fingerprint: string;
}

function currentBranch(projectPath: string): string {
  return git(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
}

function markShipped(projectPath: string, change: string): void {
  const marker = path.join(projectPath, SHIP_MARKER);
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  const body: ShipMarker = {
    branch: currentBranch(projectPath),
    change,
    fingerprint: workFingerprint(projectPath),
  };
  fs.writeFileSync(marker, JSON.stringify(body) + "\n");
}

/** The last ship marker, or null; a pre-2.0.17 marker (a bare fingerprint) has no change name. */
function readMarker(projectPath: string): ShipMarker | null {
  const marker = path.join(projectPath, SHIP_MARKER);
  if (!fs.existsSync(marker)) return null;
  const raw = fs.readFileSync(marker, "utf8").trim();
  try {
    const m = JSON.parse(raw) as Partial<ShipMarker>;
    if (typeof m.fingerprint === "string") {
      return { branch: m.branch ?? "", change: m.change ?? "", fingerprint: m.fingerprint };
    }
  } catch {
    // Legacy marker: the fingerprint alone.
  }
  return { branch: "", change: "", fingerprint: raw };
}

/**
 * Fingerprint of the branch's work outside `lawbook/changes/` and `.speclaw/`: every path that
 * differs from the merge base with `main`/`master` or is untracked, with its
 * working-tree contents. A file hashes the same whether it is untracked, staged
 * or committed, so committing work — new files included — is not new work; ship
 * writes under `lawbook/changes/`, so its own output never changes it either.
 * Without a merge base it falls back to the paths changed against HEAD plus HEAD itself.
 */
function workFingerprint(projectPath: string): string {
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  const tracked = git(projectPath, [
    "-c",
    "core.quotePath=false",
    "diff",
    "--name-only",
    base ?? "HEAD",
    "--",
    ".",
    ":(exclude)lawbook/changes",
    ":(exclude).speclaw",
  ]).split("\n");
  const hash = createHash("sha256");
  for (const f of [...new Set([...tracked, ...untrackedFiles(projectPath)])].sort()) {
    if (!f) continue;
    hash.update(`${f}\n`);
    try {
      hash.update(fs.readFileSync(path.join(projectPath, f)));
    } catch {
      // Deleted, vanished or unreadable: its name stands in.
      hash.update("\0");
    }
  }
  const anchor = base ?? git(projectPath, ["rev-parse", "HEAD"]).trim();
  return hash.update(`\n${anchor}\n`).digest("hex");
}

/**
 * The `Stop` hook body: when the agent ends a turn on a feature branch with
 * work that changed since the last ship, run {@link shipChange} for the change
 * last shipped on this branch, else the one named after the branch. Skips in
 * milliseconds otherwise, so a turn that only answered a question costs nothing.
 *
 * @param projectPath - Project root.
 * @returns Why it skipped, or the ship result.
 */
export function shipOnStop(projectPath: string): ShipOnStopResult {
  if (!isGitRepo(projectPath)) return { skipped: "not-git" };
  const branch = currentBranch(projectPath);
  if (!branch || ["main", "master", "HEAD"].includes(branch)) return { skipped: "base-branch" };
  if (branchFiles(projectPath).length === 0) return { skipped: "no-changes" };
  const marker = readMarker(projectPath);
  if (marker?.fingerprint === workFingerprint(projectPath)) {
    return { skipped: "unchanged-since-last-ship" };
  }
  // A change shipped by name on this branch keeps receiving the branch's later
  // work; the branch name would point at another (possibly archived) change.
  const change =
    marker && marker.branch === branch && marker.change
      ? marker.change
      : changeNameForBranch(branch);
  return { skipped: null, change, result: shipChange(projectPath, change) };
}
