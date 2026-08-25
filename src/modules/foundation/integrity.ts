/**
 * Rule-file integrity verification (digests + injection scan).
 * Distinct from {@link verifyLaws} (deps/graph engines).
 */
// Covers: req~integrity-verify~1, req~laws-accept-human~1
import fs from "node:fs";
import path from "node:path";
import {
  digestText,
  discoverIntegrityPaths,
  extractSpeclawYamlBlock,
  integrityPolicy,
  isRegenerableIdeMirror,
  lockfilePath,
  readLockfile,
  refreshLockfile,
  rootDigest,
  writeLockfile,
  type LockAccepted,
  type SpeclawLock,
} from "./lock.js";
import { loadScanSuppressions, scanPaths, type ScanFinding } from "./scan.js";
import type { Finding, VerifyReport } from "./verify-model.js";

export type FileIntegrityStatus =
  "ok" | "modified" | "missing" | "untracked-by-lock" | "accepted" | "advisory-modified";

export interface IntegrityFileResult {
  path: string;
  ownership: string;
  status: FileIntegrityStatus;
  expected?: string;
  actual?: string;
  diff?: string;
}

export interface IntegritySymlinkResult {
  path: string;
  expectedTarget: string;
  actualTarget: string | null;
  status: "ok" | "mismatch" | "missing";
}

export interface IntegrityReport {
  ok: boolean;
  lockPresent: boolean;
  rootMatches: boolean;
  guidance?: string;
  files: IntegrityFileResult[];
  symlinks: IntegritySymlinkResult[];
  findings: ScanFinding[];
  /** Findings shaped for {@link VerifyReport}. */
  verifyFindings: Finding[];
}

export interface VerifyIntegrityOpts {
  projectPath: string;
  /** integrity | scan | both */
  checks?: "integrity" | "scan" | "both";
}

/**
 * Verify digests and/or scan rule files. Missing lockfile is soft (ok=true)
 * with guidance to run `speclaw laws lock`.
 */
export function verifyIntegrity(opts: VerifyIntegrityOpts): IntegrityReport {
  const projectPath = opts.projectPath;
  const checks = opts.checks ?? "both";
  const doIntegrity = checks === "integrity" || checks === "both";
  const doScan = checks === "scan" || checks === "both";

  let lock: SpeclawLock | null;
  try {
    lock = readLockfile(projectPath);
  } catch (err) {
    return {
      ok: false,
      lockPresent: fs.existsSync(lockfilePath(projectPath)),
      rootMatches: false,
      guidance: (err as Error).message,
      files: [],
      symlinks: [],
      findings: [],
      verifyFindings: [
        {
          lawId: "integrity~lockfile~1",
          severity: "error",
          engine: "integrity",
          file: "speclaw.lock",
          message: (err as Error).message,
        },
      ],
    };
  }

  if (!lock && doIntegrity) {
    const scanned = doScan ? scanAll(projectPath) : [];
    const scanErrors = scanned.filter((f) => f.severity === "error");
    return {
      ok: scanErrors.length === 0,
      lockPresent: false,
      rootMatches: false,
      guidance: "No speclaw.lock — run `speclaw laws lock` to create the baseline.",
      files: [],
      symlinks: [],
      findings: scanned,
      verifyFindings: scanned
        .filter((f) => f.severity === "error" || f.severity === "warn")
        .map(scanToFinding),
    };
  }

  const files: IntegrityFileResult[] = [];
  const symlinks: IntegritySymlinkResult[] = [];
  const verifyFindings: Finding[] = [];
  let ok = true;

  if (lock && doIntegrity) {
    const accepted = new Map(lock.accepted.map((a) => [a.path, a.digest]));

    for (const [rel, entry] of Object.entries(lock.files)) {
      const abs = path.join(projectPath, rel);
      if (!fs.existsSync(abs)) {
        // Stale lock entries for regenerable IDE mirrors (ai-specs gitignored) —
        // warn only; never fail CI on a clean clone.
        if (isRegenerableIdeMirror(rel)) {
          files.push({
            path: rel,
            ownership: entry.ownership,
            status: "missing",
            expected: entry.digest,
          });
          verifyFindings.push({
            lawId: "integrity~missing~1",
            severity: "warn",
            engine: "integrity",
            file: rel,
            message:
              "Regenerable IDE rule mirror missing — run `speclaw update` or `speclaw laws lock` to drop stale entries",
          });
          continue;
        }
        const severity = entry.ownership === "strict" ? "error" : "warn";
        if (entry.ownership === "strict") ok = false;
        files.push({
          path: rel,
          ownership: entry.ownership,
          status: "missing",
          expected: entry.digest,
        });
        verifyFindings.push({
          lawId: "integrity~missing~1",
          severity,
          engine: "integrity",
          file: rel,
          message:
            entry.ownership === "strict"
              ? `Managed rule file missing (expected ${entry.digest})`
              : `Advisory rule/source file missing (expected ${entry.digest})`,
        });
        continue;
      }
      let raw = fs.readFileSync(abs, "utf8");
      if (rel === ".coderabbit.yaml") {
        raw = extractSpeclawYamlBlock(raw) ?? raw;
      }
      const actual = digestText(raw);
      if (actual === entry.digest) {
        files.push({
          path: rel,
          ownership: entry.ownership,
          status: "ok",
          expected: entry.digest,
          actual,
        });
        continue;
      }
      if (accepted.get(rel) === actual) {
        files.push({
          path: rel,
          ownership: entry.ownership,
          status: "accepted",
          expected: entry.digest,
          actual,
        });
        continue;
      }
      const unified = `--- speclaw.lock (${entry.digest})\n+++ ${rel} (${actual})\n`;
      const isStrict = entry.ownership === "strict";
      if (isStrict) ok = false;
      files.push({
        path: rel,
        ownership: entry.ownership,
        status: isStrict ? "modified" : "advisory-modified",
        expected: entry.digest,
        actual,
        diff: unified,
      });
      verifyFindings.push({
        lawId: isStrict ? "integrity~digest-mismatch~1" : "integrity~advisory-mismatch~1",
        severity: isStrict ? "error" : "warn",
        engine: "integrity",
        file: rel,
        message: isStrict
          ? `Digest mismatch for strict rule file`
          : `Advisory rule/source file changed`,
        detail: `expected ${entry.digest} found ${actual}`,
      });
    }

    const { files: discovered } = discoverIntegrityPaths(projectPath);
    for (const rel of discovered) {
      if (lock.files[rel]) continue;
      const ownership = integrityPolicy(rel);
      if (ownership === "scan-only") continue;
      files.push({ path: rel, ownership, status: "untracked-by-lock" });
      verifyFindings.push({
        lawId: "integrity~untracked~1",
        severity: "warn",
        engine: "integrity",
        file: rel,
        message: `Rule file not listed in speclaw.lock`,
      });
    }

    for (const [rel, entry] of Object.entries(lock.symlinks)) {
      const abs = path.join(projectPath, rel);
      let actual: string | null = null;
      try {
        if (fs.lstatSync(abs).isSymbolicLink()) actual = fs.readlinkSync(abs);
      } catch {
        actual = null;
      }
      if (actual === null) {
        symlinks.push({
          path: rel,
          expectedTarget: entry.target,
          actualTarget: null,
          status: "missing",
        });
        ok = false;
        verifyFindings.push({
          lawId: "integrity~symlink~1",
          severity: "error",
          engine: "integrity",
          file: rel,
          message: `Managed symlink missing (expected → ${entry.target})`,
        });
      } else if (normalizeLink(actual) !== normalizeLink(entry.target)) {
        symlinks.push({
          path: rel,
          expectedTarget: entry.target,
          actualTarget: actual,
          status: "mismatch",
        });
        ok = false;
        verifyFindings.push({
          lawId: "integrity~symlink~1",
          severity: "error",
          engine: "integrity",
          file: rel,
          message: `Managed symlink retargeted`,
          detail: `expected ${entry.target} found ${actual}`,
        });
      } else {
        symlinks.push({
          path: rel,
          expectedTarget: entry.target,
          actualTarget: actual,
          status: "ok",
        });
      }
    }
  }

  const findings = doScan ? scanAll(projectPath) : [];
  for (const f of findings.filter((x) => x.severity === "error")) {
    ok = false;
    verifyFindings.push(scanToFinding(f));
  }
  for (const f of findings.filter((x) => x.severity === "warn")) {
    verifyFindings.push(scanToFinding(f));
  }

  return {
    ok,
    lockPresent: lock !== null,
    rootMatches: lock ? rootDigest(lock.files) === lock.root : false,
    guidance:
      !lock && doIntegrity
        ? "No speclaw.lock — run `speclaw laws lock` to create the baseline."
        : undefined,
    files,
    symlinks,
    findings,
    verifyFindings,
  };
}

/**
 * Fold integrity findings into a batch {@link VerifyReport} (SARIF / exit codes).
 * Error-severity findings increment `summary.failed`.
 */
export function foldIntegrityIntoReport(report: VerifyReport, integrity: IntegrityReport): void {
  for (const f of integrity.verifyFindings) {
    report.findings.push(f);
    if (f.severity === "error") report.summary.failed += 1;
  }
}

function normalizeLink(t: string): string {
  return t.split("\\").join("/").replace(/\/+$/, "");
}

function scanAll(projectPath: string): ScanFinding[] {
  const { files } = discoverIntegrityPaths(projectPath);
  return scanPaths(projectPath, files, {
    suppressions: loadScanSuppressions(projectPath),
  });
}

function scanToFinding(f: ScanFinding): Finding {
  return {
    lawId: f.detector.replace(/\//g, "~"),
    severity: f.severity,
    engine: "integrity",
    file: f.path,
    line: f.line,
    message: f.message,
    detail: f.excerpt,
  };
}

/**
 * Accept a changed file's current digest into the lock (caller must ensure TTY).
 * Updates digest, root, and accepted[].
 */
export function acceptLockPath(
  projectPath: string,
  relPath: string,
  meta: { by: string; note?: string; at?: string },
): SpeclawLock {
  const lock = readLockfile(projectPath);
  if (!lock) throw new Error("No speclaw.lock — run `speclaw laws lock` first.");
  const abs = path.join(projectPath, relPath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${relPath}`);
  let raw = fs.readFileSync(abs, "utf8");
  if (relPath === ".coderabbit.yaml") raw = extractSpeclawYamlBlock(raw) ?? raw;
  const dig = digestText(raw);
  const ownership = lock.files[relPath]?.ownership ?? integrityPolicy(relPath);
  if (ownership === "scan-only") {
    throw new Error(`${relPath} is scan-only — digests are not locked for this path.`);
  }
  lock.files[relPath] = { digest: dig, ownership };
  lock.root = rootDigest(lock.files);
  const entry: LockAccepted = {
    path: relPath,
    digest: dig,
    at: meta.at ?? new Date().toISOString(),
    by: meta.by,
    note: meta.note,
  };
  lock.accepted = [...lock.accepted.filter((a) => a.path !== relPath), entry];
  writeLockfile(projectPath, lock);
  return lock;
}

/** Re-export refresh for CLI `laws lock`. */
export { refreshLockfile };

/** True when stdin is a TTY (accept requires this). */
export function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
