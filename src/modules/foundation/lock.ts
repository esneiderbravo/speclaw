/**
 * speclaw.lock — committed digests for rule files (never under `.speclaw/`).
 * A gitignored lock would be invisible in PR diffs and would not detect
 * Rules File Backdoor edits. Like package-lock.json / go.sum.
 */
// Covers: req~speclaw-lock~1
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pkgName, pkgVersion } from "../../shared/version.js";
import {
  COMPASS_MAP_END,
  COMPASS_MAP_START,
  stripCompassMapBlock,
} from "../../shared/compass-map.js";

export const LOCKFILE_NAME = "speclaw.lock";
export const LOCKFILE_VERSION = 1;

/** Delimited provenance block excluded from digests (self-reference). */
export const PROVENANCE_START = "<!-- speclaw:begin-provenance";
export const PROVENANCE_END = "speclaw:end-provenance -->";

export type LockOwnership = "strict" | "advisory" | "scan-only";

export interface LockFileEntry {
  digest: string;
  ownership: LockOwnership;
  laws?: string[];
}

export interface LockSymlinkEntry {
  target: string;
}

export interface LockAccepted {
  path: string;
  digest: string;
  at: string;
  by: string;
  note?: string;
}

export interface SpeclawLock {
  lockfileVersion: number;
  generator: string;
  algorithm: "sha256";
  root: string;
  files: Record<string, LockFileEntry>;
  symlinks: Record<string, LockSymlinkEntry>;
  accepted: LockAccepted[];
}

/** Project-relative path of the committed lockfile. */
export function lockfilePath(projectPath: string): string {
  return path.join(projectPath, LOCKFILE_NAME);
}

/**
 * Canonical bytes for hashing: LF endings, strip provenance, trim EOL spaces,
 * ensure a single trailing newline.
 */
export function canonicalize(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = stripProvenanceBlock(text);
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  if (!text.endsWith("\n")) text += "\n";
  else if (text.endsWith("\n\n")) {
    // collapse to exactly one trailing newline
    text = text.replace(/\n+$/g, "\n");
  }
  return text;
}

/** Remove speclaw provenance HTML comment blocks. */
export function stripProvenanceBlock(text: string): string {
  const re = new RegExp(
    `${escapeRegExp(PROVENANCE_START)}[\\s\\S]*?${escapeRegExp(PROVENANCE_END)}\\n?`,
    "g",
  );
  return text.replace(re, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** sha256 digest with `sha256:` prefix. */
export function digestOf(canonical: string): string {
  const hex = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

/** Digest raw file text after canonicalization. */
export function digestText(raw: string): string {
  return digestOf(canonicalize(raw));
}

/** Root hash over sorted path → digest pairs. */
export function rootDigest(files: Record<string, LockFileEntry>): string {
  const paths = Object.keys(files).sort();
  let acc = "";
  for (const p of paths) {
    acc += `${p}\0${files[p]!.digest}\n`;
  }
  return digestOf(acc);
}

/**
 * Read `speclaw.lock`.
 *
 * @param projectPath - Project root.
 * @returns The lock, or `null` only when the file does not exist.
 * @throws When the file exists but cannot be read: a parse error, a missing or
 *   unsupported `lockfileVersion`, or a body that parses but has the wrong
 *   structure (see {@link lockShapeError}). A malformed lock is never coerced
 *   into an empty one, because refreshing from an empty lock would launder
 *   every drifted strict file.
 */
export function readLockfile(projectPath: string): SpeclawLock | null {
  const abs = lockfilePath(projectPath);
  if (!fs.existsSync(abs)) return null;
  let raw: SpeclawLock;
  try {
    raw = JSON.parse(fs.readFileSync(abs, "utf8")) as SpeclawLock;
  } catch (err) {
    throw new Error(`speclaw.lock: unreadable (${(err as Error).message})`, { cause: err });
  }
  if (!raw || typeof raw !== "object") throw new Error("speclaw.lock: not a JSON object");
  if (typeof raw.lockfileVersion !== "number") {
    throw new Error("speclaw.lock: missing lockfileVersion");
  }
  if (raw.lockfileVersion > LOCKFILE_VERSION) {
    throw new Error(
      `speclaw.lock: unsupported lockfileVersion ${raw.lockfileVersion} (max ${LOCKFILE_VERSION})`,
    );
  }
  const shape = lockShapeError(raw as unknown as Record<string, unknown>);
  if (shape) throw new Error(`speclaw.lock: invalid structure (${shape})`);
  return {
    lockfileVersion: raw.lockfileVersion,
    generator: String(raw.generator ?? ""),
    algorithm: "sha256",
    root: String(raw.root ?? ""),
    files: raw.files ?? {},
    symlinks: raw.symlinks ?? {},
    accepted: raw.accepted ?? [],
  };
}

const LOCK_OWNERSHIPS: readonly string[] = ["strict", "advisory", "scan-only"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The first structural defect of a parsed lock body. `files`, `symlinks`, and
 * `accepted` may be absent (they default to empty), but when present they must
 * have the lockfile's types: `files` maps paths to `{ digest: string,
 * ownership }`, `symlinks` maps paths to `{ target: string }`, and `accepted`
 * is an array of `{ path: string, digest: string }` records.
 *
 * @param raw - The parsed JSON object.
 * @returns A short description of the defect, or `null` when the shape is valid.
 */
function lockShapeError(raw: Record<string, unknown>): string | null {
  const { files, symlinks, accepted } = raw;
  if (files !== undefined) {
    if (!isPlainObject(files)) return "files is not an object";
    for (const [rel, e] of Object.entries(files)) {
      if (!isPlainObject(e) || typeof e.digest !== "string") {
        return `files["${rel}"] has no string digest`;
      }
      if (typeof e.ownership !== "string" || !LOCK_OWNERSHIPS.includes(e.ownership)) {
        return `files["${rel}"] has an unknown ownership`;
      }
    }
  }
  if (symlinks !== undefined) {
    if (!isPlainObject(symlinks)) return "symlinks is not an object";
    for (const [rel, e] of Object.entries(symlinks)) {
      if (!isPlainObject(e) || typeof e.target !== "string") {
        return `symlinks["${rel}"] has no string target`;
      }
    }
  }
  if (accepted !== undefined) {
    if (!Array.isArray(accepted)) return "accepted is not an array";
    for (const [i, a] of accepted.entries()) {
      if (!isPlainObject(a) || typeof a.path !== "string" || typeof a.digest !== "string") {
        return `accepted[${i}] needs a string path and digest`;
      }
    }
  }
  return null;
}

/** Write lockfile with stable JSON formatting. */
export function writeLockfile(projectPath: string, lock: SpeclawLock): void {
  const abs = lockfilePath(projectPath);
  const body = JSON.stringify(lock, null, 2) + "\n";
  fs.writeFileSync(abs, body);
}

/** Build a fresh lock object from file digests + symlinks. */
export function buildLock(opts: {
  files: Record<string, LockFileEntry>;
  symlinks?: Record<string, LockSymlinkEntry>;
  accepted?: LockAccepted[];
}): SpeclawLock {
  const files = { ...opts.files };
  return {
    lockfileVersion: LOCKFILE_VERSION,
    generator: `${pkgName()}@${pkgVersion()}`,
    algorithm: "sha256",
    root: rootDigest(files),
    files,
    symlinks: { ...(opts.symlinks ?? {}) },
    accepted: [...(opts.accepted ?? [])],
  };
}

/** Integrity severity policy for a project-relative path. */
export function integrityPolicy(relPath: string): LockOwnership {
  const n = relPath.split("\\").join("/");
  // Regenerable IDE mirrors of gitignored `ai-specs/` (`.cursor/rules/`, the
  // `.claude/rules/speclaw` link) fall through to scan-only: lock/CI must not
  // treat them as strict committed files; scan when present, never pin.
  if (
    n === "AGENTS.md" ||
    n === "CLAUDE.md" ||
    n.startsWith(".github/instructions/") ||
    n === ".coderabbit.yaml"
  ) {
    return "strict";
  }
  if (n === "LAWS.md" || n === "docs/compass.md" || n.startsWith("docs/standards/")) {
    return "advisory";
  }
  return "scan-only";
}

/**
 * True when a path is an IDE mirror of regenerable (typically gitignored) content.
 *
 * Covers the `.claude/rules/speclaw` symlink as well as mirror files: the link
 * targets gitignored `ai-specs/rules`, so on a clean clone it is absent (when
 * the project ignores it) or dangling, and must never be pinned in, or fail
 * verify against, the lock.
 *
 * @param relPath - Project-relative path (file or symlink).
 * @returns Whether lock/verify should treat the path as regenerable.
 */
export function isRegenerableIdeMirror(relPath: string): boolean {
  const n = relPath.split("\\").join("/");
  return (
    n === ".claude/rules/speclaw" ||
    n.startsWith(".claude/rules/speclaw/") ||
    n.startsWith(".cursor/rules/") ||
    n.startsWith(".cursor/skills/") ||
    n.startsWith(".cursor/commands/") ||
    n.startsWith(".claude/skills/") ||
    n.startsWith(".claude/commands/") ||
    n.startsWith("ai-specs/")
  );
}

/** Discover candidate paths under the project for locking / scanning. */
export function discoverIntegrityPaths(projectPath: string): {
  files: string[];
  symlinks: Array<{ path: string; target: string }>;
} {
  const files: string[] = [];
  const symlinks: Array<{ path: string; target: string }> = [];

  const addFile = (rel: string) => {
    const abs = path.join(projectPath, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) files.push(rel.split("\\").join("/"));
  };

  for (const f of ["AGENTS.md", "CLAUDE.md", "LAWS.md", "docs/compass.md", ".coderabbit.yaml"]) {
    addFile(f);
  }
  walkFiles(path.join(projectPath, "docs", "standards"), projectPath, files, (p) =>
    p.endsWith(".md"),
  );
  walkFiles(path.join(projectPath, ".cursor", "rules"), projectPath, files, () => true);
  walkFiles(path.join(projectPath, ".github", "instructions"), projectPath, files, () => true);

  // Outside-pipeline / skills (scan-only)
  for (const f of [".clinerules", ".windsurfrules", "BUGBOT.md", ".cursorrules"]) addFile(f);
  walkFiles(
    path.join(projectPath, "ai-specs", "skills"),
    projectPath,
    files,
    (p) => p.endsWith("SKILL.md") || p.endsWith(".md"),
  );
  walkFiles(path.join(projectPath, "ai-specs", "agents"), projectPath, files, (p) =>
    p.endsWith(".md"),
  );
  walkFiles(
    path.join(projectPath, ".claude", "skills"),
    projectPath,
    files,
    (p) => p.endsWith("SKILL.md") || p.endsWith(".md"),
  );

  const linkRel = ".claude/rules/speclaw";
  const linkAbs = path.join(projectPath, linkRel);
  try {
    const st = fs.lstatSync(linkAbs);
    if (st.isSymbolicLink()) {
      symlinks.push({ path: linkRel, target: fs.readlinkSync(linkAbs) });
    }
  } catch {
    /* missing */
  }

  return { files: [...new Set(files)].sort(), symlinks };
}

function walkFiles(
  dir: string,
  projectPath: string,
  out: string[],
  pred: (rel: string) => boolean,
): void {
  if (!fs.existsSync(dir)) return;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        const rel = path.relative(projectPath, full).split(path.sep).join("/");
        if (pred(rel)) out.push(rel);
      }
    }
  }
}

// The map block helpers moved to shared/ so the lawbook can ignore the
// regenerated map too; re-exported here for existing importers.
export { COMPASS_MAP_END, COMPASS_MAP_START, stripCompassMapBlock };

/**
 * Path-specific bytes that feed {@link digestText}: speclaw-owned coderabbit
 * region, regenerable Compass map body stripped, otherwise the file as-is.
 *
 * @param relPath - Project-relative path.
 * @param raw - File contents.
 * @returns Text to canonicalize and hash for this path.
 */
export function prepareIntegrityText(relPath: string, raw: string): string {
  const n = relPath.split("\\").join("/");
  if (n === ".coderabbit.yaml") return extractSpeclawYamlBlock(raw) ?? raw;
  if (n === "docs/compass.md") return stripCompassMapBlock(raw);
  return raw;
}

/**
 * Snapshot digests for discovered files with ownership policy.
 * For `.coderabbit.yaml`, digests only the speclaw delimited block when present.
 * For `docs/compass.md`, digests with the regenerable map body stripped.
 * Regenerable IDE mirror symlinks ({@link isRegenerableIdeMirror}) are never
 * pinned, so the lock is identical with or without the local link.
 */
export function snapshotLockEntries(projectPath: string): {
  files: Record<string, LockFileEntry>;
  symlinks: Record<string, LockSymlinkEntry>;
} {
  const { files: paths, symlinks } = discoverIntegrityPaths(projectPath);
  const files: Record<string, LockFileEntry> = {};
  for (const rel of paths) {
    const ownership = integrityPolicy(rel);
    if (ownership === "scan-only") continue; // locked only when previously accepted / explicit
    const abs = path.join(projectPath, rel);
    const raw = prepareIntegrityText(rel, fs.readFileSync(abs, "utf8"));
    files[rel] = { digest: digestText(raw), ownership };
  }
  const symlinkMap: Record<string, LockSymlinkEntry> = {};
  for (const s of symlinks) {
    if (isRegenerableIdeMirror(s.path)) continue;
    symlinkMap[s.path] = { target: s.target };
  }
  return { files, symlinks: symlinkMap };
}

/** Extract a speclaw-marked region from coderabbit yaml if present. */
export function extractSpeclawYamlBlock(raw: string): string | null {
  const m = /# speclaw:begin[\s\S]*?# speclaw:end/.exec(raw);
  if (m) return m[0]!;
  const m2 =
    /<!-- speclaw:laws:start -->[\s\S]*?<!-- speclaw:laws:end -->/.exec(raw) ??
    /<!-- speclaw:begin-provenance[\s\S]*?speclaw:end-provenance -->/.exec(raw);
  return m2 ? m2[0]! : null;
}

/**
 * Strict lock paths whose on-disk digest matches neither the locked digest nor
 * an `accepted[]` digest for that path — files edited outside the speclaw
 * pipeline. A missing file is not drifted (verify reports it as missing).
 * Callers that write rule files must compute this **before** those writes.
 *
 * @param projectPath - Project root holding `speclaw.lock`.
 * @param prev - The current lock; read from disk when omitted.
 * @returns The drifted strict paths, sorted (empty when no lockfile exists).
 * @throws When `speclaw.lock` exists but cannot be read (parse error,
 *   unsupported `lockfileVersion`, invalid structure) — an unreadable lock is
 *   never "no drift".
 */
// Covers: req~lock-preserves-drift~1
export function driftedStrictPaths(
  projectPath: string,
  prev: SpeclawLock | null = readLockfile(projectPath),
): string[] {
  if (!prev) return [];
  const drifted: string[] = [];
  for (const [rel, entry] of Object.entries(prev.files)) {
    if (entry.ownership !== "strict") continue;
    const actual = onDiskDigest(projectPath, rel);
    if (actual === null || actual === entry.digest) continue;
    if (prev.accepted.some((a) => a.path === rel && a.digest === actual)) continue;
    drifted.push(rel);
  }
  return drifted.sort();
}

/**
 * The warning shown for a strict file whose locked digest a refresh kept.
 *
 * @param rel - Project-relative path of the drifted file.
 * @returns One line naming the file and the `laws accept` command.
 */
export function lockPreservedWarning(rel: string): string {
  return (
    `${rel} drifted from speclaw.lock — kept the locked digest; ` + `run speclaw laws accept ${rel}`
  );
}

/**
 * The integrity digest of a project file as it is on disk.
 *
 * @param projectPath - Project root.
 * @param rel - Project-relative path.
 * @returns The digest, or `null` when the path is not a regular file.
 */
export function onDiskDigest(projectPath: string, rel: string): string | null {
  const abs = path.join(projectPath, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return digestText(prepareIntegrityText(rel, fs.readFileSync(abs, "utf8")));
}

/** One drifted strict path as shown to the human before a `--force` re-baseline. */
export interface ConfirmedDrift {
  path: string;
  /** The digest recorded in `speclaw.lock` when the prompt was shown. */
  locked: string;
  /** The on-disk digest when the prompt was shown. */
  actual: string;
}

/** Thrown when the tree or the lock changed between a confirmation and its write. */
export class LockChangedError extends Error {
  constructor(detail: string) {
    super(`${detail} changed while the confirmation was open`);
    this.name = "LockChangedError";
  }
}

/**
 * Re-check a confirmed re-baseline against the lock and the snapshot about to
 * be written: the drifted set must be exactly the confirmed paths, and each
 * path's locked and on-disk digests must equal what was shown.
 *
 * @returns The drifted paths (equal to the confirmed ones).
 * @throws {LockChangedError} On any difference.
 */
function checkConfirmedDrift(
  projectPath: string,
  prev: SpeclawLock | null,
  files: Record<string, LockFileEntry>,
  confirmed: ConfirmedDrift[],
): string[] {
  const now = driftedStrictPaths(projectPath, prev);
  const shown = confirmed.map((c) => c.path).sort();
  const extra = now.filter((p) => !shown.includes(p));
  if (extra.length) throw new LockChangedError(`newly drifted ${extra.join(", ")}`);
  const gone = shown.filter((p) => !now.includes(p));
  if (gone.length) throw new LockChangedError(gone.join(", "));
  for (const c of confirmed) {
    if (prev?.files[c.path]?.digest !== c.locked) {
      throw new LockChangedError(`the locked digest of ${c.path}`);
    }
    // A locked path outside discovery is not in the snapshot; read it directly.
    const actual = files[c.path]?.digest ?? onDiskDigest(projectPath, c.path);
    if (actual !== c.actual) throw new LockChangedError(c.path);
  }
  return now;
}

/** What a lock refresh did beyond writing the new digests. */
export interface LockRefreshResult {
  /** The lock as written. */
  lock: SpeclawLock;
  /** Drifted strict paths that kept their locked digest (each one needs `laws accept`). */
  preserved: string[];
  /** Drifted strict paths re-baselined to disk (only with `rebaseline`). */
  rebaselined: string[];
  /** Number of `accepted[]` entries dropped as stale or superseded. */
  pruned: number;
}

/**
 * Create or refresh speclaw.lock from the current tree without laundering
 * tampering: a strict path that drifted from the lock keeps its locked digest
 * (and is reported in `preserved`) unless `rebaseline` is given, which only the
 * interactive `laws lock --force` passes. Clean strict paths are refreshed, new
 * strict paths are added, and advisory paths are refreshed freely. `accepted[]`
 * entries survive only while they equal their path's locked digest. A fresh
 * baseline is built only when no lockfile exists: a lockfile that exists but
 * cannot be read is never overwritten, because rebuilding it from disk would
 * launder every drifted strict file (and downgrade a newer-format lock).
 *
 * @param projectPath - Project root.
 * @param opts - `drifted`: the drifted strict paths computed before any rule
 *   file was written (defaults to computing them now); `rebaseline`: re-baseline
 *   drifted paths to disk and record an `accepted[]` entry by `by` for each
 *   (with the optional human `note` appended to the `laws lock --force` note).
 *   `rebaseline.confirmed` is what the human was shown and approved; when
 *   given, the drifted set and every locked and on-disk digest are re-checked
 *   against it from the snapshot about to be written, closing the gap between
 *   the prompt and the write.
 * @returns The written lock plus the preserved, re-baselined, and pruned counts.
 * @throws When `speclaw.lock` exists but cannot be read (parse error,
 *   unsupported `lockfileVersion`, invalid structure); nothing is written.
 * @throws {LockChangedError} When `rebaseline.confirmed` no longer matches the
 *   drifted set or the digests on disk; nothing is written.
 */
// Covers: req~lock-preserves-drift~1
export function refreshLockfile(
  projectPath: string,
  opts: {
    drifted?: string[];
    rebaseline?: { by: string; note?: string; confirmed?: ConfirmedDrift[] };
  } = {},
): LockRefreshResult {
  const prev = readLockfile(projectPath);
  const { files, symlinks } = snapshotLockEntries(projectPath);
  const confirmed = opts.rebaseline?.confirmed;
  const drifted = confirmed
    ? checkConfirmedDrift(projectPath, prev, files, confirmed)
    : (opts.drifted ?? driftedStrictPaths(projectPath, prev));
  const accepted: LockAccepted[] = [...(prev?.accepted ?? [])];
  const preserved: string[] = [];
  const rebaselined: string[] = [];
  const at = new Date().toISOString();

  for (const rel of drifted) {
    const old = prev?.files[rel];
    const next = files[rel];
    if (!old || !next || old.ownership !== "strict") continue;
    if (opts.rebaseline) {
      if (next.digest !== old.digest) {
        rebaselined.push(rel);
        accepted.push({
          path: rel,
          digest: next.digest,
          at,
          by: opts.rebaseline.by,
          note: opts.rebaseline.note
            ? `laws lock --force: ${opts.rebaseline.note}`
            : "laws lock --force",
        });
      }
    } else if (next.digest !== old.digest) {
      files[rel] = old;
      preserved.push(rel);
    }
  }

  const kept = accepted.filter(
    (a) => files[a.path] !== undefined && files[a.path]!.digest === a.digest,
  );
  const lock = buildLock({ files, symlinks, accepted: kept });
  writeLockfile(projectPath, lock);
  return { lock, preserved, rebaselined, pruned: accepted.length - kept.length };
}

/** Render a data-only provenance HTML comment (no imperatives). */
export function provenanceBlock(opts: {
  lawIds?: string[];
  source?: string;
  digest: string;
}): string {
  const laws = (opts.lawIds ?? []).map((l) => `  law: ${l}`).join("\n");
  return (
    `${PROVENANCE_START}\n` +
    (laws ? laws + "\n" : "") +
    (opts.source ? `  source: ${opts.source}\n` : "") +
    `  digest: ${opts.digest}\n` +
    `  generator: ${pkgName()}@${pkgVersion()}\n` +
    `speclaw:end-provenance -->\n`
  );
}
