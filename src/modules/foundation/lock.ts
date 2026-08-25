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

/** Read lockfile or null if missing. Throws on unknown version / parse error. */
export function readLockfile(projectPath: string): SpeclawLock | null {
  const abs = lockfilePath(projectPath);
  if (!fs.existsSync(abs)) return null;
  const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as SpeclawLock;
  if (typeof raw.lockfileVersion !== "number") {
    throw new Error("speclaw.lock: missing lockfileVersion");
  }
  if (raw.lockfileVersion > LOCKFILE_VERSION) {
    throw new Error(
      `speclaw.lock: unsupported lockfileVersion ${raw.lockfileVersion} (max ${LOCKFILE_VERSION})`,
    );
  }
  return {
    lockfileVersion: raw.lockfileVersion,
    generator: String(raw.generator ?? ""),
    algorithm: "sha256",
    root: String(raw.root ?? ""),
    files: raw.files && typeof raw.files === "object" ? raw.files : {},
    symlinks: raw.symlinks && typeof raw.symlinks === "object" ? raw.symlinks : {},
    accepted: Array.isArray(raw.accepted) ? raw.accepted : [],
  };
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
  // `.cursor/rules/` mirrors regenerable `ai-specs/` (gitignored) — lock/CI must
  // not treat them as strict committed files; scan when present, never pin.
  if (
    n === "AGENTS.md" ||
    n === "CLAUDE.md" ||
    n.startsWith(".github/instructions/") ||
    n === ".coderabbit.yaml" ||
    n === ".claude/rules/speclaw"
  ) {
    return "strict";
  }
  if (n === "LAWS.md" || n === "docs/compass.md" || n.startsWith("docs/standards/")) {
    return "advisory";
  }
  return "scan-only";
}

/** True when a path is an IDE mirror of regenerable (typically gitignored) content. */
export function isRegenerableIdeMirror(relPath: string): boolean {
  const n = relPath.split("\\").join("/");
  return (
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

/** Markers for the regenerable map block inside `docs/compass.md` (see compass/map.ts). */
export const COMPASS_MAP_START = "<!-- speclaw:map:start -->";
export const COMPASS_MAP_END = "<!-- speclaw:map:end -->";

/**
 * Strip the regenerable map body between markers so integrity digests stay stable
 * across `speclaw index` (which rewrites the map in CI before verify).
 *
 * @param text - Full docs/compass.md contents.
 * @returns The same text with an empty map body, or `text` if markers are missing.
 */
export function stripCompassMapBlock(text: string): string {
  const start = text.indexOf(COMPASS_MAP_START);
  const end = text.indexOf(COMPASS_MAP_END);
  if (start < 0 || end < 0 || end < start) return text;
  return text.slice(0, start + COMPASS_MAP_START.length) + "\n" + text.slice(end);
}

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
  for (const s of symlinks) symlinkMap[s.path] = { target: s.target };
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

/** Create or refresh speclaw.lock from the current tree. */
export function refreshLockfile(projectPath: string): SpeclawLock {
  const prev = (() => {
    try {
      return readLockfile(projectPath);
    } catch {
      return null;
    }
  })();
  const { files, symlinks } = snapshotLockEntries(projectPath);
  const lock = buildLock({
    files,
    symlinks,
    accepted: prev?.accepted ?? [],
  });
  writeLockfile(projectPath, lock);
  return lock;
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
