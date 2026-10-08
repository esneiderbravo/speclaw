import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { changedFiles, isGitRepo, mergeBase, worktreeChangedFiles } from "../../shared/git.js";
import { handleHarness, readHarness } from "../cortex/harness.js";
import { deltaSpecFiles, specArchive, specArchivePreconditions } from "./engine.js";
import {
  artifactNeeds,
  confirmedLevel,
  gatherSignals,
  loadCeremonyConfig,
  promoteCeremonyLevel,
  proposeLevel,
  readCeremonyRecord,
  readChangeType,
  type CeremonyProposal,
} from "./levels.js";
import { scaffoldQuick } from "./quick.js";
import { CHANGE_NAME_RE, isPlaceholderDelta, scaffoldFeature } from "./scaffold-change.js";

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
  /** Report path; null when ship stopped on `pending` artifacts before the gates. */
  report: string | null;
  /**
   * Artifacts the change's level requires that are missing or still a stub.
   * When non-empty, no gate ran: the agent writes them and ships again.
   */
  pending: string[];
  /** Archive destination; null when not archived (see `next`). */
  archivedTo: string | null;
  /** What still has to happen, e.g. human review on the PR for level 1+. */
  next: string[];
  timings: ShipTimings;
}

export interface ShipOptions {
  /**
   * 1–5 line what-and-why written into record.md; defaults to the branch's
   * commit messages, else at level 0 the changed-file list (level 1+ asks the agent).
   */
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

const RECORD_STUB = "<!-- 2–5 lines: what and why. -->";

function fillRecord(recordPath: string, summary: string | undefined): void {
  if (!fs.existsSync(recordPath)) return;
  let body = fs.readFileSync(recordPath, "utf8");
  // A function replacer: `$&` or `$'` in a commit body must stay literal.
  if (summary) body = body.replace(RECORD_STUB, () => summary);
  fs.writeFileSync(recordPath, body.replace(/^- \[ \] /gm, "- [x] "));
}

/**
 * The branch's own commit messages (subjects and bodies, trailers dropped),
 * skipping commits that only touched ship's output; empty when there are none.
 * A Conventional Commit body is the change's why, so it stands in for one.
 */
function commitSummary(projectPath: string): string {
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  if (!base) return "";
  return git(projectPath, [
    "log",
    "--format=%B",
    `${base}..HEAD`,
    "--",
    ".",
    ":(exclude)lawbook/changes",
    ":(exclude).speclaw",
  ])
    .split("\n")
    .filter((l) => !/^[\w-]+-by:/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split("\n")
    .slice(0, COMMIT_SUMMARY_LINES)
    .join("\n");
}

/** A record's why is a few lines; a long branch history keeps only its start. */
const COMMIT_SUMMARY_LINES = 15;

/** A manifest whose only diff against `base` is its `"version"` lines: a release bump. */
function isVersionBump(projectPath: string, base: string | null, file: string): boolean {
  if (!base || !/(^|\/)package(-lock)?\.json$/.test(file)) return false;
  const lines = git(projectPath, ["diff", "-U0", base, "--", file])
    .split("\n")
    .filter((l) => /^[+-](?![+-]{2})/.test(l));
  return lines.length > 0 && lines.every((l) => /^[+-]\s*"version"\s*:/.test(l));
}

/**
 * Propose a ceremony level from the branch diff itself. A release bump of the
 * manifests is not a global change, so it does not raise the level.
 */
function measureDiff(projectPath: string, files: string[]): CeremonyProposal {
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  const paths = files.filter((f) => !isVersionBump(projectPath, base, f));
  const { thresholds } = loadCeremonyConfig(projectPath);
  return proposeLevel(gatherSignals(projectPath, { paths, symbols: [] }, thresholds), thresholds);
}

/**
 * Create the change at the level its diff measures: level 0 gets a record,
 * level 1+ the feature stubs that level requires. The level is recorded as
 * `measured`, so a later, larger diff raises it.
 */
function scaffoldMeasured(
  projectPath: string,
  name: string,
  files: string[],
  measured?: CeremonyProposal,
): void {
  const proposal = measured ?? measureDiff(projectPath, files);
  const targets = { paths: files, symbols: [] };
  const level = proposal.level ?? 0;
  if (level > 0 && CHANGE_NAME_RE.test(name)) {
    scaffoldFeature(projectPath, name, { level, targets, proposal, confirmedBy: "measured" });
  } else {
    scaffoldQuick(projectPath, name, targets, { proposal, confirmedBy: "measured" });
  }
}

/** Raise a measured level when the branch diff has grown past it; a human-set level stands. */
function remeasure(projectPath: string, name: string, files: string[]): void {
  const rec = readCeremonyRecord(projectPath, name);
  if (rec?.confirmedBy !== "measured") return;
  const proposal = measureDiff(projectPath, files);
  if (proposal.level !== null && proposal.level > rec.confirmedLevel) {
    promoteCeremonyLevel(projectPath, name, proposal.level, "the branch diff grew", proposal);
  }
}

/**
 * Reopen a change archived on this branch at a measured level the diff has
 * since outgrown (work shipped at a mid-task stop, then grew): move it back
 * under `lawbook/changes/`, drop its finished harness, and raise its level. An
 * archive that already exists at the merge base belongs to merged work and stays.
 *
 * @returns Whether the change was reopened.
 */
function reopenIfGrown(
  projectPath: string,
  name: string,
  archivedRel: string,
  files: string[],
): boolean {
  const archivedDir = path.join(projectPath, archivedRel);
  let rec: { confirmedBy?: string; confirmedLevel?: number } = {};
  try {
    rec = JSON.parse(fs.readFileSync(path.join(archivedDir, "change.json"), "utf8")) as typeof rec;
  } catch {
    return false;
  }
  if (rec.confirmedBy !== "measured" || rec.confirmedLevel === undefined) return false;
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  if (!base) return false;
  // git object paths are POSIX on every platform.
  const objectPath = `${archivedRel.split(path.sep).join("/")}/change.json`;
  const atBase = spawnSync("git", ["cat-file", "-e", `${base}:${objectPath}`], {
    cwd: projectPath,
  });
  if (atBase.status === 0) return false;
  const proposal = measureDiff(projectPath, files);
  if (proposal.level === null || proposal.level <= rec.confirmedLevel) return false;
  const changeDir = path.join(projectPath, "lawbook", "changes", name);
  fs.renameSync(archivedDir, changeDir);
  fs.rmSync(path.join(changeDir, "harness.json"), { force: true });
  promoteCeremonyLevel(projectPath, name, proposal.level, "the branch diff grew", proposal);
  return true;
}

/**
 * Text a scaffold, a promotion, or ship itself leaves in an artifact until
 * someone writes it. Task stubs match whole generated lines only, so a real
 * task that starts the same way ("Make the hook idempotent") is never a stub.
 */
const STUBS: Record<string, RegExp[]> = {
  // At level 1+ the level-0 file list ship filled in is not a why.
  "record.md": [/<!-- 2–5 lines: what and why\. -->/, /^Changed \d+ file\(s\): /m],
  "proposal.md": [
    /<!-- The problem and who it affects\. -->/,
    /\(promoted — fill in why\)/,
    // A promotion seeds Why from the level rationale and What with this line.
    /\(promoted from level \d\)/,
  ],
  "design.md": [/<!-- Module boundaries, data flow, and decisions\. -->/, /\(promoted — fill in\)/],
  "tasks.md": [
    /^\s*- \[[ xX]\] (1\.1 Implement the change|Implement|Make the fix|Make the change|Add or update a regression test|Add or update tests|Record evidence under reports\/|Write discipline report under reports\/)\s*$/m,
  ],
};

/**
 * Artifacts the change's confirmed level requires that are missing or still a
 * scaffold stub, as instructions the agent can act on. Level 0 owes nothing:
 * its record falls back to the commits or the file list, so it costs no turn. Bug-shaped changes keep
 * their own checks (`bugfix.md`) and are not judged here.
 *
 * @param projectPath - Project root with `lawbook/`.
 * @param name - Change name.
 * @returns One instruction per missing artifact; empty when the change is documented.
 */
export function pendingArtifacts(projectPath: string, name: string): string[] {
  const dir = path.join(projectPath, "lawbook", "changes", name);
  if (!fs.existsSync(dir) || readChangeType(projectPath, name) === "bug") return [];
  const level = confirmedLevel(projectPath, name);
  const needs = artifactNeeds(level, "feature");
  const rel = (f: string) => path.join("lawbook", "changes", name, f);
  const state = (f: string): "missing" | "stub" | "written" => {
    const abs = path.join(dir, f);
    if (!fs.existsSync(abs)) return "missing";
    const text = fs.readFileSync(abs, "utf8");
    return (STUBS[f] ?? []).some((m) => m.test(text)) ? "stub" : "written";
  };
  const out: string[] = [];
  // Level 0 never waits on prose: the record falls back to commits or the file list.
  if (needs.record && level > 0 && state("record.md") !== "written") {
    out.push(`${rel("record.md")}: write what changed and why (2–5 lines) under "What changes"`);
  }
  if (needs.proposal && state("proposal.md") !== "written") {
    out.push(`${rel("proposal.md")}: write why, what changes, and the impact`);
  }
  const design = state("design.md");
  if (needs.design && !needs.designOptionalWithJustification && design !== "written") {
    out.push(`${rel("design.md")}: write the approach — boundaries, data flow, decisions`);
  } else if (design === "stub") {
    out.push(`${rel("design.md")}: write the approach, or delete it (optional at level 2)`);
  }
  if (needs.tasksFile && state("tasks.md") !== "written") {
    out.push(`${rel("tasks.md")}: list the tasks this change did, checked (- [x])`);
  }
  if (needs.deltaSpecs) {
    const specs = deltaSpecFiles(dir);
    if (specs.length === 0) {
      out.push(
        `${rel("specs/<capability>/spec.md")}: add the full intended spec of the capability this changes`,
      );
    }
    for (const f of specs) {
      if (isPlaceholderDelta(fs.readFileSync(f, "utf8"))) {
        out.push(
          `${path.relative(projectPath, f)}: replace the placeholder with the capability's full intended spec (or move it to the capability it changes)`,
        );
      }
    }
  }
  return out;
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
 * Fast path for finished work, in one call: create the change at the level its
 * branch diff measures (raising a measured level when the diff grew), refuse
 * to run the gates while an artifact that level requires is missing or still a
 * stub, then run the project's gates once and write a discipline report from
 * their real output. At level 0 passing gates are the whole verification, so
 * the change is archived. At level 1+ ship stops after the evidence: review is
 * a human (or reviewer-role) decision taken on the PR, and the archive follows it.
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

  let archived = findArchived(projectPath, name);
  if (archived && !fs.existsSync(changeDir) && reopenIfGrown(projectPath, name, archived, files)) {
    archived = null;
  }
  if (!fs.existsSync(changeDir) && !archived) scaffoldMeasured(projectPath, name, files);
  else if (fs.existsSync(changeDir)) remeasure(projectPath, name, files);
  const commits = isGitRepo(projectPath) ? commitSummary(projectPath) : "";
  const fileList = files.length
    ? `Changed ${files.length} file(s): ${files.slice(0, 8).join(", ")}${files.length > 8 ? ", …" : ""}`
    : "No file changes detected.";
  fillRecord(
    path.join(changeDir, "record.md"),
    opts.summary ?? (commits || (confirmedLevel(projectPath, name) === 0 ? fileList : "")),
  );
  const pending = pendingArtifacts(projectPath, name);
  const t1 = Date.now();
  if (pending.length) {
    const level = confirmedLevel(projectPath, name);
    const why = readCeremonyRecord(projectPath, name)?.rationale ?? "";
    return {
      change: name,
      gatesPassed: false,
      gates: [],
      files,
      report: null,
      pending,
      archivedTo: null,
      next: [
        `level ${level}${why ? ` (${why})` : ""}: document the change, then stop again — the gates run once it is written`,
        ...pending,
      ],
      timings: {
        scaffold: t1 - t0,
        gates: 0,
        report: 0,
        archive: 0,
        overhead: t1 - t0,
        total: t1 - t0,
      },
    };
  }

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
    pending,
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

/** Where {@link docHint} remembers what it last measured and told. */
const DOC_HINT_STATE = path.join(".speclaw", "doc-hint.json");

/** The change the hook would ship on this branch: the one last shipped here, else the branch's. */
function branchChange(projectPath: string, branch: string): string {
  const marker = readMarker(projectPath);
  return marker && marker.branch === branch && marker.change
    ? marker.change
    : changeNameForBranch(branch);
}

/**
 * The documentation a change owes, told while the agent is still working so it
 * writes it in the same turn as the code instead of after a blocked stop. Runs
 * from the `PostToolUse` hook: it re-measures only when the set of changed
 * files changed, creates the change once the diff measures level 1 or more,
 * and speaks once per change and level. Never throws; null means say nothing.
 *
 * @param projectPath - Project root.
 * @returns The hint for the agent, or null.
 */
export function docHint(projectPath: string): string | null {
  try {
    if (!fs.existsSync(path.join(projectPath, "lawbook"))) return null;
    // One git call answers "anything new?" on most calls (this runs after every
    // edit and Bash call): branch, HEAD, and the worktree outside ship's output.
    const status = git(projectPath, [
      "-c",
      "core.quotePath=false",
      "status",
      "--porcelain=v2",
      "--branch",
      "--untracked-files=all",
    ]);
    const branch = /^# branch\.head (.+)$/m.exec(status)?.[1] ?? "";
    if (!branch || ["main", "master", "(detached)"].includes(branch)) return null;
    const quick = status
      .split("\n")
      .filter((l) => !l.includes(" lawbook/changes/") && !l.includes(" .speclaw/"))
      .join("\n");
    const statePath = path.join(projectPath, DOC_HINT_STATE);
    let prev: { quick?: string; key?: string; change?: string; level?: number } = {};
    try {
      prev = JSON.parse(fs.readFileSync(statePath, "utf8")) as typeof prev;
    } catch {
      // First hint on this checkout.
    }
    if (prev.quick === quick) return null;
    const files = branchFiles(projectPath);
    const key = `${branch}\n${files.join("\n")}`;
    const remember = (extra: { change?: string; level?: number }) => {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({ ...prev, quick, key, ...extra }) + "\n");
    };
    if (files.length === 0 || prev.key === key) {
      remember({});
      return null;
    }

    const change = branchChange(projectPath, branch);
    const changeDir = path.join(projectPath, "lawbook", "changes", change);
    const archived = findArchived(projectPath, change);
    if (fs.existsSync(changeDir)) remeasure(projectPath, change, files);
    else if (archived) reopenIfGrown(projectPath, change, archived, files);
    else {
      const proposal = measureDiff(projectPath, files);
      if ((proposal.level ?? 0) > 0) scaffoldMeasured(projectPath, change, files, proposal);
    }
    const level = fs.existsSync(changeDir) ? confirmedLevel(projectPath, change) : 0;
    remember({ change, level });

    const pending = level > 0 ? pendingArtifacts(projectPath, change) : [];
    if (pending.length === 0 || (prev.change === change && prev.level === level)) return null;
    const why = readCeremonyRecord(projectPath, change)?.rationale ?? "";
    return (
      `speclaw: this change measures level ${level}${why ? ` (${why})` : ""}. ` +
      `In this same turn, before you stop, write briefly and truthfully:\n- ${pending.join("\n- ")}\n` +
      `The Stop hook then runs the gates once.`
    );
  } catch {
    return null;
  }
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
  const change = branchChange(projectPath, branch);
  return { skipped: null, change, result: shipChange(projectPath, change) };
}
