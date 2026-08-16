import type { Finding, VerifyReport } from "./verify.js";
import type { Severity } from "./laws.js";

/** Threshold at which a finding fails the process. Default for `speclaw verify`. */
export type FailOn = "error" | "warn" | "info";

const RANK: Record<Severity, number> = { error: 3, warn: 2, info: 1 };

/**
 * Parse `--fail-on`. An omitted flag is `error`; any other string is invalid
 * (the CLI maps that to exit 2).
 *
 * @param raw - The flag value from `parseFlags`.
 */
export function parseFailOn(raw: unknown): FailOn | null {
  if (raw === undefined || raw === true) return "error";
  if (raw === "error" || raw === "warn" || raw === "info") return raw;
  return null;
}

/**
 * Stable identity of a finding, reused as the SARIF `partialFingerprints`
 * value. There is no known-violations baseline in this slice, so the
 * fingerprint is local: law + file + line.
 *
 * @param f - A batch finding.
 */
export function fingerprint(f: Finding): string {
  return `${f.lawId}:${f.file}:${f.line ?? 0}`;
}

/**
 * Map a {@link VerifyReport} onto the public `speclaw verify` exit codes
 * `0` / `1` / `4`. Usage (`2`) and environment (`3`) errors are decided by
 * the CLI before this runs.
 *
 * @param report - The batch report.
 * @param opts.failOn - Minimum severity that fails the process.
 * @param opts.strictEngines - When true, any skip becomes exit `4`.
 */
export function verifyExitCode(
  report: VerifyReport,
  opts: { failOn: FailOn; strictEngines: boolean },
): 0 | 1 | 4 {
  const threshold = RANK[opts.failOn];
  if (report.findings.some((f) => RANK[f.severity] >= threshold)) return 1;
  if (opts.strictEngines && report.skipped.length > 0) return 4;
  return 0;
}
