import type { Law, Severity } from "./laws.js";
import { fingerprint } from "./ci.js";
import type { Finding, VerifyReport } from "./verify.js";

/** Inputs the SARIF projection needs beyond the report itself. */
export interface SarifContext {
  speclawVersion: string;
  laws: Law[];
}

/** GitHub Code Scanning rejects a run with more than this many results. */
export const SARIF_RESULT_CAP = 5000;

function toSarifLevel(s: Severity): "error" | "warning" | "note" {
  if (s === "error") return "error";
  if (s === "warn") return "warning";
  return "note";
}

/**
 * A project-relative POSIX URI. Absolute paths (Unix `/…` or Windows `C:\…`)
 * make GitHub drop the annotation; never emit them.
 *
 * @param file - A finding's `file` field (already project-relative POSIX).
 */
export function toRepoRelativeUri(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(/^[A-Za-z]:/, "")
    .replace(/^\/+/, "");
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/**
 * Project a {@link VerifyReport} to SARIF 2.1.0. One `rule` per loaded law
 * (so GitHub groups alerts by law id); results truncated to
 * {@link SARIF_RESULT_CAP} by severity; skipped laws become
 * `toolExecutionNotifications`.
 *
 * @param report - The batch report.
 * @param ctx - Package version and the laws that were loaded.
 * @returns A JSON-serialisable SARIF log.
 */
export function toSarif(report: VerifyReport, ctx: SarifContext): Record<string, unknown> {
  const sorted = [...report.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const dropped = Math.max(0, sorted.length - SARIF_RESULT_CAP);
  const kept = dropped > 0 ? sorted.slice(0, SARIF_RESULT_CAP) : sorted;

  const notifications: Array<{ level: string; message: { text: string } }> = report.skipped.map(
    (s) => ({
      level: "warning",
      message: {
        text: `Law ${s.lawId} not evaluated: ${s.reason}${s.detail ? ` (${s.detail})` : ""}`,
      },
    }),
  );
  if (dropped > 0) {
    notifications.push({
      level: "warning",
      message: { text: `Truncated ${dropped} findings (SARIF cap ${SARIF_RESULT_CAP})` },
    });
  }

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "speclaw",
            informationUri: "https://github.com/esneiderbravo/speclaw",
            semanticVersion: ctx.speclawVersion,
            rules: ctx.laws.map((law) => ({
              id: law.id,
              name: law.id.replace(/~/g, "_"),
              shortDescription: { text: law.title },
              fullDescription: { text: law.prose },
              help: {
                text: law.rationale ?? law.prose,
                markdown: `**${law.title}**\n\n${law.prose}`,
              },
              properties: { tags: ["speclaw", law.verification.kind] },
            })),
          },
        },
        results: kept.map((f: Finding) => ({
          ruleId: f.lawId,
          level: toSarifLevel(f.severity),
          message: { text: f.detail ? `${f.message} ${f.detail}` : f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: toRepoRelativeUri(f.file) },
                region: { startLine: f.line ?? 1 },
              },
            },
          ],
          partialFingerprints: { "speclaw/v1": fingerprint(f) },
        })),
        invocations: [
          {
            executionSuccessful: report.summary.failed === 0,
            toolExecutionNotifications: notifications,
          },
        ],
      },
    ],
  };
}
