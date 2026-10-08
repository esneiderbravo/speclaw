import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { changedFiles, isGitRepo, mergeBase, worktreeChangedFiles } from "../../shared/git.js";
import { isTestPath, loadAffectedConfig, matchesAny } from "../compass/affected-config.js";
import { affectedTests } from "../compass/affected.js";
import { COMPASS_DOC, stripCompassMapBlock } from "../../shared/compass-map.js";
import { handleHarness, readHarness } from "../cortex/harness.js";
import { deltaSpecFiles, specArchive, specArchivePreconditions, specList } from "./engine.js";
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
import { apiSurfaceChanges } from "./api-surface.js";

/** One quality gate run by {@link shipChange}. */
export interface ShipGate {
  command: string;
  exitCode: number;
  durationMs: number;
  /** Last lines of combined stdout/stderr, for the report. */
  tail: string;
  /** What a scoped test gate ran instead of the full suite, and why. */
  scope?: string;
  /** The discipline a per-package test gate reports under; absent for repo-wide gates. */
  discipline?: string;
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
  /** Every report written: one per discipline at level 2+, else just {@link report}. */
  reports: string[];
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
export function readShipConfig(projectPath: string): {
  gates?: string[];
  discipline?: string;
  tests?: "affected" | "full";
} {
  const cfg = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfg)) return {};
  const out: { gates?: string[]; discipline?: string; tests?: "affected" | "full" } = {};
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
    const t = /^\s+tests:\s*["']?(affected|full)["']?\s*$/.exec(line);
    if (t) out.tests = t[1] as "affected" | "full";
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

/** The project's whole test suite, as `detectGates` and people write it. */
const TEST_GATE_RE = /^(npm|pnpm|yarn)( run)? test\s*$/;

/**
 * The tests a branch diff reaches, to run at the stop instead of the whole
 * suite: a one-line fix should not wait on every test in the repo, and the
 * full suite still runs in CI before merge. Falls back to the full suite when
 * the selection cannot be trusted — no index, a global file, or source changes
 * no test reaches.
 *
 * @returns The command to run (null: nothing to run) and what it covers.
 */
function scopedTestGate(
  projectPath: string,
  fullCommand: string,
  files: string[],
): {
  command: string | null;
  scope: string;
  /** One command per package the selection spans, to run as separate gates. */
  parts?: Array<{ cwd: string; command: string; tests: number }>;
} {
  const full = (why: string) => ({ command: fullCommand, scope: `full suite: ${why}` });
  try {
    const at = affectedTests(projectPath, { files });
    if (at.mode === "all") return full(at.reason);
    if (at.tests.length === 0 || !at.command) {
      const { thresholds } = loadCeremonyConfig(projectPath);
      const code = files.filter((f) => !matchesAny(f, thresholds.docGlobs));
      if (code.length) return full("no test reaches the changed code");
      return { command: null, scope: "docs only: no test reaches the change" };
    }
    return {
      command: at.command,
      scope: `${at.tests.length} affected test file(s), ${at.skipped.files} skipped; the full suite runs in CI`,
      parts: at.commands.map((c) => ({ cwd: c.cwd, command: c.command, tests: c.files.length })),
    };
  } catch (e) {
    return full(e instanceof Error ? e.message : String(e));
  }
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

/**
 * What the lawbook writes itself: change folders and reports, the canonical
 * specs an archive promotes, the anchors it seals, and the local index. None
 * of it is the agent's work, so none of it may trigger, size or re-run a ship
 * — archiving used to read as new work and re-run every gate.
 */
const OWN_OUTPUT = ["lawbook/changes/", "lawbook/specs/", "lawbook/anchors/", ".speclaw/"] as const;

function isOwnOutput(file: string): boolean {
  return OWN_OUTPUT.some((dir) => file.startsWith(dir));
}

/** The same paths as git pathspecs, for commands that list or log the work. */
const OWN_OUTPUT_EXCLUDES = OWN_OUTPUT.map((dir) => `:(exclude)${dir.replace(/\/$/, "")}`);

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
    .filter((f) => !isOwnOutput(f))
    .filter((f) => f !== COMPASS_DOC || !onlyMapChanged(projectPath, base))
    .sort();
}

/**
 * Whether `docs/compass.md` differs from `base` only inside its generated map
 * block: every full index rewrites that block, so on a fresh branch it would
 * otherwise read as the agent's work and ship an empty change.
 */
function onlyMapChanged(projectPath: string, base: string | null): boolean {
  if (!base) return false;
  try {
    const now = fs.readFileSync(path.join(projectPath, COMPASS_DOC), "utf8");
    const then = git(projectPath, ["show", `${base}:${COMPASS_DOC}`]);
    // Line endings are the platform's (core.autocrlf), not the agent's work.
    const lf = (t: string) => stripCompassMapBlock(t.replace(/\r\n/g, "\n"));
    return then !== "" && lf(now) === lf(then);
  } catch {
    return false;
  }
}

/** New files not yet added, outside the lawbook's own output ({@link OWN_OUTPUT}). */
function untrackedFiles(projectPath: string): string[] {
  return git(projectPath, [
    "-c",
    "core.quotePath=false",
    "ls-files",
    "--others",
    "--exclude-standard",
  ])
    .split("\n")
    .filter((f) => f && !isOwnOutput(f));
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
  others: string[] = [],
): string {
  const rows = gates
    .map(
      (g) =>
        `| \`${g.command}\`${g.scope ? ` (${g.scope})` : ""} | ${g.exitCode === 0 ? "pass" : `FAIL (exit ${g.exitCode})`} | ${secs(g.durationMs)} |`,
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

${files.length ? files.map((f) => `- \`${f}\``).join("\n") : "- (none detected)"}${
    others.length
      ? `\n\nPlus ${others.length} file(s) outside this discipline's package: ${others
          .slice(0, 8)
          .map((f) => `\`${f}\``)
          .join(", ")}${others.length > 8 ? ", …" : ""}`
      : ""
  }

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
 * The discipline a package's tests report under, named for the package
 * directory: `apps/backend` → `backend`, `apps/web` → `frontend`. A generated
 * report is never `api.md`: that one documents the contract and the agent writes it.
 *
 * @param cwd - Package directory relative to the root (`.` for the root).
 * @param fallback - The discipline for the root package.
 */
function disciplineOf(cwd: string, fallback: string): string {
  if (cwd === ".") return fallback;
  const leaf = cwd.split("/").pop()!.toLowerCase();
  if (/^(backend|api|server|service|services)$/.test(leaf)) return "backend";
  if (/^(web|frontend|client|ui|app|site|webapp)$/.test(leaf)) return "frontend";
  if (/^(e2e|playwright|cypress|acceptance)$/.test(leaf)) return "e2e";
  if (/^(mobile|ios|android)$/.test(leaf)) return "mobile";
  return leaf.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

/** A path as one shell word. */
function shellArg(s: string): string {
  return /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

/** One report to write: its discipline, the gates it carries, and its files. */
interface ReportGroup {
  discipline: string;
  gates: ShipGate[];
  files: string[];
  /** Changed files no discipline's package holds. */
  others: string[];
}

/**
 * Group the gates into reports. Without per-package gates there is one report
 * with every gate and file. Otherwise each discipline gets its own test gates
 * plus the repo-wide ones (lint, build), and the files under its packages.
 */
function reportGroups(
  gates: ShipGate[],
  files: string[],
  fallback: string,
  cwds: Map<string, string[]>,
): ReportGroup[] {
  if (cwds.size === 0) return [{ discipline: fallback, gates, files, others: [] }];
  const shared = gates.filter((g) => !g.discipline);
  const under = (f: string, cwd: string) => cwd !== "." && f.startsWith(`${cwd}/`);
  const claimed = new Set(files.filter((f) => [...cwds.values()].flat().some((c) => under(f, c))));
  return [...cwds.entries()].map(([d, dirs]) => {
    const own = dirs.includes(".")
      ? files.filter((f) => !claimed.has(f) || dirs.some((c) => under(f, c)))
      : files.filter((f) => dirs.some((c) => under(f, c)));
    return {
      discipline: d,
      gates: [...shared, ...gates.filter((g) => g.discipline === d)],
      files: own,
      others: files.filter((f) => !own.includes(f) && !claimed.has(f)),
    };
  });
}

/** Marks a report ship wrote, so a later ship may replace or remove it. */
const GENERATED_MARK = "**Generated by:** `speclaw ship`";

/** Remove reports an earlier ship generated that this ship no longer writes. */
function dropStaleReports(projectPath: string, reportsRel: string, kept: string[]): void {
  const dir = path.join(projectPath, reportsRel);
  for (const f of fs.readdirSync(dir)) {
    const rel = path.join(reportsRel, f);
    if (!f.endsWith(".md") || kept.includes(rel)) continue;
    try {
      if (fs.readFileSync(path.join(dir, f), "utf8").includes(GENERATED_MARK)) {
        fs.rmSync(path.join(dir, f));
      }
    } catch {
      // A report that cannot be read is left as it is.
    }
  }
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
    ...OWN_OUTPUT_EXCLUDES,
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

/** Source lines a diff may change, in one source file, and still be a level-0 fix. */
const SMALL_FIX_LINES = 10;

/**
 * Propose a ceremony level from the branch diff itself. A release bump of the
 * manifests is not a global change, so it does not raise the level, and a
 * small fix stays at level 0 however central the code it touches: its blast
 * radius is guarded by the gates and its test, which ceremony would not add to.
 */
function measureDiff(
  projectPath: string,
  files: string[],
  measured?: CeremonyProposal,
): CeremonyProposal {
  const proposal = measured ?? measureDiffSignals(projectPath, files);
  if (!proposal.level || proposal.signals.touchesPublicApi || proposal.signals.touchesGlobalFile) {
    return proposal;
  }
  const fix = smallFix(projectPath, files);
  if (!fix) return proposal;
  return {
    ...proposal,
    level: 0,
    rationale: `${proposal.rationale}; small fix (${fix.lines} source line(s) in ${fix.files} file) → level 0`,
  };
}

/**
 * The size of a diff that changes at most one source file (tests and docs
 * aside) by at most {@link SMALL_FIX_LINES} lines, or null when it is larger.
 */
function smallFix(projectPath: string, files: string[]): { files: number; lines: number } | null {
  const { testGlobs } = loadAffectedConfig(projectPath);
  const { thresholds } = loadCeremonyConfig(projectPath);
  const source = files.filter(
    (f) => !isTestPath(f, testGlobs) && !matchesAny(f, thresholds.docGlobs),
  );
  if (source.length > 1) return null;
  if (source.length === 0) return { files: 0, lines: 0 };
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  const numstat = base ? git(projectPath, ["diff", "--numstat", base, "--", source[0]]) : "";
  let lines = numstat
    .split("\n")
    .filter(Boolean)
    .reduce((n, l) => {
      const [add, del] = l.split("\t");
      return n + (Number(add) || 0) + (Number(del) || 0);
    }, 0);
  if (!numstat.trim()) {
    // Untracked: every line is new.
    try {
      lines = fs.readFileSync(path.join(projectPath, source[0]), "utf8").split("\n").length;
    } catch {
      return null;
    }
  }
  return lines <= SMALL_FIX_LINES ? { files: 1, lines } : null;
}

function measureDiffSignals(projectPath: string, files: string[]): CeremonyProposal {
  const cached = cachedMeasure(projectPath, files);
  if (cached) return cached;
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  const paths = files.filter((f) => !isVersionBump(projectPath, base, f));
  const { thresholds } = loadCeremonyConfig(projectPath);
  const proposal = proposeLevel(
    gatherSignals(projectPath, { paths, symbols: [] }, thresholds),
    thresholds,
  );
  try {
    const file = path.join(projectPath, LEVEL_CACHE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ key: fileSetKey(files), files, proposal }) + "\n");
  } catch {
    // The cache only saves time; the measurement stands without it.
  }
  return proposal;
}

/**
 * The last measurement, kept per changed-file set: measuring a large diff
 * (blast radius, affected tests) takes seconds, so the edit hook measures in
 * the background and ship reuses the result at the stop.
 */
const LEVEL_CACHE = path.join(".speclaw", "level-cache.json");

function fileSetKey(files: string[]): string {
  return createHash("sha256").update(files.join("\n")).digest("hex");
}

/** The cached proposal for exactly this file set, or null. */
function cachedMeasure(projectPath: string, files: string[]): CeremonyProposal | null {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(projectPath, LEVEL_CACHE), "utf8")) as {
      key?: string;
      proposal?: CeremonyProposal;
    };
    return c.key === fileSetKey(files) && c.proposal ? c.proposal : null;
  } catch {
    return null;
  }
}

/**
 * The last measurement when the diff has only grown since it was taken: its
 * level is a floor for the current one, since a measured level only rises. A
 * large diff takes seconds to measure and an agent at work outdates every
 * measurement before it lands, so waiting for an exact one never tells it.
 */
function grownFromCache(projectPath: string, files: string[]): CeremonyProposal | null {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(projectPath, LEVEL_CACHE), "utf8")) as {
      files?: string[];
      proposal?: CeremonyProposal;
    };
    if (!c.proposal || !Array.isArray(c.files) || c.files.length === 0) return null;
    const now = new Set(files);
    return c.files.every((f) => now.has(f)) ? c.proposal : null;
  } catch {
    return null;
  }
}

/**
 * Measure the branch's current diff into the level cache (`speclaw
 * measure-diff`, the edit hook's detached background job).
 *
 * @param projectPath - Project root.
 */
export function measureBranchDiff(projectPath: string): void {
  const files = branchFiles(projectPath);
  if (files.length) measureDiff(projectPath, files);
}

/** The CLI entry beside this module, run by the background measurement. */
const CLI_ENTRY = fileURLToPath(new URL("../../cli/index.js", import.meta.url));

/** Start `speclaw measure-diff` in its own process group; never waits, never throws. */
function measureInBackground(projectPath: string): void {
  try {
    const child = spawn(process.execPath, [CLI_ENTRY, "measure-diff"], {
      cwd: projectPath,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The stop measures anyway; a lost background job only delays the hint.
  }
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
function remeasure(
  projectPath: string,
  name: string,
  files: string[],
  measured?: CeremonyProposal,
): void {
  const rec = readCeremonyRecord(projectPath, name);
  if (rec?.confirmedBy !== "measured") return;
  const proposal = measured ?? measureDiff(projectPath, files);
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
  measured?: CeremonyProposal,
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
  const proposal = measured ?? measureDiff(projectPath, files);
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
 * A change whose diff touches an API surface (a route, a DTO, a contract file)
 * also owes `reports/api.md`: the contract is evidence no gate output carries.
 *
 * @param projectPath - Project root with `lawbook/`.
 * @param name - Change name.
 * @param files - The branch's changed files; when given, the API surface is
 *   read from their diff, else from the change's recorded signals.
 * @returns One instruction per missing artifact; empty when the change is documented.
 */
export function pendingArtifacts(projectPath: string, name: string, files?: string[]): string[] {
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
  // A report ship generated (`ship.discipline: api`) is gate output, not the contract.
  const apiReport = path.join(dir, "reports", "api.md");
  const apiWritten =
    fs.existsSync(apiReport) && !fs.readFileSync(apiReport, "utf8").includes(GENERATED_MARK);
  if (level > 0 && !apiWritten) {
    const api = files
      ? apiSurfaceChanges(projectPath, files).map((h) => h.file)
      : (readCeremonyRecord(projectPath, name)?.signals.apiSurface ?? []);
    if (api.length) {
      out.push(
        `${rel("reports/api.md")}: document the API contract this change touches (${api
          .slice(0, 4)
          .join(
            ", ",
          )}${api.length > 4 ? ", …" : ""}) — method and path, auth, response shape, every status code, and how it was exercised (test client or request against an isolated store)`,
      );
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
  const pending = pendingArtifacts(projectPath, name, files);
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
      reports: [],
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
  // Level 2+ is the spec lane: its evidence is one report per discipline, so
  // tests that span several packages run (and report) package by package.
  const split = (confirmedLevel(projectPath, name) ?? 0) >= 2;
  const cwds = new Map<string, string[]>();
  const gates: ShipGate[] = [];
  for (const command of commands) {
    const scoped =
      cfg.tests !== "full" && TEST_GATE_RE.test(command.trim())
        ? scopedTestGate(projectPath, command, files)
        : null;
    if (scoped && scoped.command === null) {
      gates.push({ command, exitCode: 0, durationMs: 0, tail: "", scope: scoped.scope });
      continue;
    }
    if (split && scoped?.parts && scoped.parts.length > 1) {
      for (const part of scoped.parts) {
        const d = disciplineOf(part.cwd, discipline);
        cwds.set(d, [...(cwds.get(d) ?? []), part.cwd]);
        const g = runGate(
          projectPath,
          part.cwd === "." ? part.command : `cd ${shellArg(part.cwd)} && ${part.command}`,
        );
        gates.push({
          ...g,
          scope: `${part.tests} affected test file(s) in ${part.cwd}; the full suite runs in CI`,
          discipline: d,
        });
        if (g.exitCode !== 0) break;
      }
      if (gates[gates.length - 1].exitCode !== 0) break;
      continue;
    }
    const g = runGate(projectPath, scoped?.command ?? command);
    gates.push(scoped ? { ...g, scope: scoped.scope } : g);
    if (g.exitCode !== 0) break;
  }
  const gatesPassed = gates.every((g) => g.exitCode === 0);
  const t2 = Date.now();

  const reportsRel = path.join(
    archived && !fs.existsSync(changeDir) ? archived : path.join("lawbook", "changes", name),
    "reports",
  );
  fs.mkdirSync(path.join(projectPath, reportsRel), { recursive: true });
  const reports: string[] = [];
  for (const r of reportGroups(gates, files, discipline, cwds)) {
    const rel = path.join(reportsRel, `${r.discipline}.md`);
    fs.writeFileSync(
      path.join(projectPath, rel),
      renderReport(name, r.discipline, r.files, r.gates, gatesPassed, date, r.others),
    );
    reports.push(rel);
  }
  dropStaleReports(projectPath, reportsRel, reports);
  const reportRel = reports[0];
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
    const pre = specArchivePreconditions(projectPath, name, { syncing: true });
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
    reports,
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

/** A gate's short name for a one-line summary: `lint`, `build`, `tests backend`. */
function gateLabel(g: ShipGate): string {
  if (g.scope) return g.discipline ? `tests ${g.discipline}` : "tests";
  const short = g.command.replace(/^(npm|pnpm|yarn)( run)? /, "");
  return short.length > 40 ? `${short.slice(0, 39)}…` : short;
}

/**
 * The one line the `Stop` hook shows the user after a ship: what ran, how it
 * went, and what is left — so a stop that blocks nothing is never silent.
 *
 * @param r - The ship result.
 * @param blocked - Whether this stop was sent back to the agent.
 * @returns The summary, prefixed `speclaw:`.
 */
export function stopSummary(r: ShipResult, blocked: boolean): string {
  if (r.pending.length) {
    const owed = [...new Set(r.pending.map((p) => path.basename(p.split(":")[0])))].join(", ");
    return blocked
      ? `speclaw: ${/^level \d/.exec(r.next[0] ?? "")?.[0] ?? "the change"} owes ${owed} — sent back to the agent; the gates run once they are written`
      : `speclaw: still owed after a second stop: ${owed} — the gates did not run`;
  }
  const ran = r.gates.map((g) => `${gateLabel(g)} ${secs(g.durationMs)}`).join(" · ");
  if (!r.gatesPassed) {
    const failed = r.gates[r.gates.length - 1];
    return `speclaw: gate FAILED — ${gateLabel(failed)} (exit ${failed.exitCode})${
      blocked ? " — sent back to the agent" : "; fix it, then stop again"
    }`;
  }
  const where = r.archivedTo
    ? `archived to ${r.archivedTo}`
    : r.next.length
      ? r.next.join("; ")
      : `report ${r.report}`;
  return `speclaw: gates PASS${ran ? ` (${ran})` : ""} · ${where}`;
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
      .filter((l) => !OWN_OUTPUT.some((dir) => l.includes(` ${dir}`)))
      .join("\n");
    const statePath = path.join(projectPath, DOC_HINT_STATE);
    let prev: {
      quick?: string;
      key?: string;
      /** A background measurement started for this file set, at this time. */
      pending?: { key: string; at: number };
      /** The last change, level and owed artifacts a hint was returned for. */
      told?: { change: string; level: number; owed?: string };
    } = {};
    try {
      prev = JSON.parse(fs.readFileSync(statePath, "utf8")) as typeof prev;
    } catch {
      // First hint on this checkout.
    }
    const save = (next: typeof prev) => {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(next) + "\n");
    };
    if (prev.quick === quick && !prev.pending) return null;
    // A measurement still running for this same worktree: nothing new to say yet,
    // and listing the branch's files would cost more git calls than the answer.
    if (prev.quick === quick && prev.pending && !measuredSince(projectPath, prev.pending.at)) {
      if (Date.now() - prev.pending.at < MEASURE_GRACE_MS) return null;
    }
    const files = branchFiles(projectPath);
    const key = `${branch}\n${files.join("\n")}`;
    if (files.length === 0 || (prev.key === key && !prev.pending)) {
      save({ ...prev, quick, key });
      return null;
    }
    // Measuring a large diff takes seconds — longer than the hook may run —
    // so it happens in the background, one job at a time; meanwhile a diff
    // that only grew is told from its last measurement, a floor for its level.
    let measured = cachedMeasure(projectPath, files);
    let inFlight: { key: string; at: number } | undefined;
    if (!measured) {
      const running =
        prev.pending !== undefined &&
        Date.now() - prev.pending.at < MEASURE_GRACE_MS &&
        !measuredSince(projectPath, prev.pending.at);
      if (!running) measureInBackground(projectPath);
      inFlight = running ? prev.pending : { key, at: Date.now() };
      measured = grownFromCache(projectPath, files);
      if (!measured) {
        save({ ...prev, quick, pending: inFlight });
        return null;
      }
    }
    const proposal = measureDiff(projectPath, files, measured);

    const change = branchChange(projectPath, branch);
    const changeDir = path.join(projectPath, "lawbook", "changes", change);
    const archived = findArchived(projectPath, change);
    if (fs.existsSync(changeDir)) remeasure(projectPath, change, files, proposal);
    else if (archived) reopenIfGrown(projectPath, change, archived, files, proposal);
    else if ((proposal.level ?? 0) > 0) scaffoldMeasured(projectPath, change, files, proposal);
    const level = fs.existsSync(changeDir) ? confirmedLevel(projectPath, change) : 0;
    const pending = level > 0 ? pendingArtifacts(projectPath, change, files) : [];
    // Re-told when the change, its level, or the kind of artifact owed changes
    // (an API report owed later at the same level still has to be said).
    const owed = [...new Set(pending.map((p) => p.split(":")[0]))].sort().join(",");
    const told =
      prev.told?.change === change &&
      prev.told.level === level &&
      (prev.told.owed === undefined ||
        owed.split(",").every((o) => prev.told!.owed!.split(",").includes(o)));
    const keep = { quick, key, ...(inFlight ? { pending: inFlight } : {}) };
    if (pending.length === 0 || told) {
      save({ ...keep, ...(prev.told ? { told: prev.told } : {}) });
      return null;
    }
    // "Told" is recorded only with the hint actually returned, so a level is
    // never marked as told by a call that said nothing.
    save({ ...keep, told: { change, level, owed } });
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

/** Whether the level cache was written at or after `at` (epoch ms). */
function measuredSince(projectPath: string, at: number): boolean {
  try {
    return fs.statSync(path.join(projectPath, LEVEL_CACHE)).mtimeMs >= at;
  } catch {
    return false;
  }
}

/** How long a started background measurement is awaited before it is started again. */
const MEASURE_GRACE_MS = 2 * 60 * 1000;

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

/**
 * The change an action means when the agent left `change` out: the only
 * active change, else the one this branch ships (same rule as the stop hook).
 *
 * @param projectPath - Project root.
 * @returns The change name, or null when no single change fits.
 */
export function resolveActiveChange(projectPath: string): string | null {
  const active = specList(projectPath).activeChanges;
  if (active.length === 1) return active[0];
  if (active.length === 0 || !isGitRepo(projectPath)) return null;
  const branch = currentBranch(projectPath);
  const named = branchChange(projectPath, branch);
  if (active.includes(named)) return named;
  // `feat/FAR-1360-default-cost-center` ships `default-cost-center` too.
  const slug = changeNameForBranch(branch);
  const fits = active.filter((c) => slug.endsWith(`-${c}`) || c.endsWith(`-${slug}`));
  return fits.length === 1 ? fits[0] : null;
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
 * Fingerprint of the branch's work outside the lawbook's own output: every path that
 * differs from the merge base with `main`/`master` or is untracked, with its
 * working-tree contents. A file hashes the same whether it is untracked, staged
 * or committed, so committing work — new files included — is not new work; ship
 * and archive write only {@link OWN_OUTPUT}, so their output never changes it either.
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
    ...OWN_OUTPUT_EXCLUDES,
  ]).split("\n");
  const hash = createHash("sha256");
  const files = [...new Set([...tracked, ...untrackedFiles(projectPath)])]
    // A map-only docs/compass.md is no work: neither its bytes nor its name count.
    .filter((f) => f !== COMPASS_DOC || !onlyMapChanged(projectPath, base))
    .sort();
  for (const f of files) {
    if (!f) continue;
    hash.update(`${f}\n`);
    try {
      const bytes = fs.readFileSync(path.join(projectPath, f));
      // A re-index rewrites the map block; only the rest of the file is work.
      hash.update(f === COMPASS_DOC ? stripCompassMapBlock(bytes.toString("utf8")) : bytes);
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
