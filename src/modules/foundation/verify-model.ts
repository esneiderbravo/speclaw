import type { Severity } from "./laws.js";

// Shared report model for the batch verifier. Lives apart from `verify.ts` so
// the `deps`/`graph` engines can cite `Finding` and `underPaths` without a
// module cycle (verify → engines → verify).

/** The batch backends this verifier can run. */
export type BatchEngine = "deps" | "graph";

/** Engine tag on a finding — batch backends plus rule-file integrity. */
export type FindingEngine = BatchEngine | "integrity";

/** One law violation located in the code, with provenance back to the law. */
export interface Finding {
  lawId: string;
  severity: Severity;
  /** The backend that produced it. */
  engine: FindingEngine;
  /** Project-relative POSIX path of the offending file. */
  file: string;
  /** 1-based line of the offending edge, when the finding is edge-level. */
  line?: number;
  /** The law's prose, cited verbatim. */
  message: string;
  /** Extra context (the destination, the cycle, the SCC size, …). */
  detail?: string;
}

/** A law that could not be evaluated, always with a machine-readable reason. */
export interface SkippedLaw {
  lawId: string;
  reason: "no-index" | "engine-error" | "draft";
  detail?: string;
}

/** A law whose result is unknown because it rests on unresolved edges. */
export interface UnknownEntry {
  lawId: string;
  detail: string;
}

/** The contract both `check-dispatcher` (hooks) and `verify-ci` consume. */
export interface VerifyReport {
  schemaVersion: 1;
  summary: {
    /** Laws that ran an engine (passed + failed + unknown). */
    evaluated: number;
    passed: number;
    failed: number;
    skipped: number;
    unknown: number;
  };
  findings: Finding[];
  skipped: SkippedLaw[];
  unknown: UnknownEntry[];
  elapsedMs: number;
}

/** Arguments for {@link verifyLaws} and the `law_verify` tool. */
export interface VerifyArgs {
  projectPath: string;
  /** Restrict evaluation to source files under these project-relative paths. */
  paths?: string[];
  /** Which batch engines to run; omit for all of them. */
  engines?: BatchEngine[];
  /** Restrict to these law ids; omit for every batch law. */
  lawIds?: string[];
}

/**
 * True when `file` (POSIX, project-relative) is at or under one of `paths`.
 *
 * @param file - A project-relative POSIX path.
 * @param paths - Optional path prefixes; omitted or empty matches everything.
 */
export function underPaths(file: string, paths: string[] | undefined): boolean {
  if (!paths || paths.length === 0) return true;
  return paths.some((p) => {
    const norm = p.replace(/\/+$/, "");
    return file === norm || file.startsWith(norm + "/");
  });
}
