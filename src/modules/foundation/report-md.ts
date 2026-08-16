import type { VerifyReport } from "./verify.js";

/**
 * Markdown projection of a {@link VerifyReport} for `$GITHUB_STEP_SUMMARY`
 * (and stdout `--format markdown`). Honest by construction: it lists findings
 * and skips, and never claims a requirement is covered (trace is not in this
 * slice).
 *
 * @param report - The batch report.
 */
export function toMarkdown(report: VerifyReport): string {
  const lines: string[] = [
    "## speclaw · law verification",
    "",
    `**${report.summary.passed}** passed · **${report.summary.failed}** failed · **${report.summary.skipped}** skipped · **${report.summary.unknown}** unknown`,
    "",
  ];
  if (report.findings.length > 0) {
    lines.push("### Findings", "", "| Law | Severity | Location |", "| :-- | :-- | :-- |");
    for (const f of report.findings) {
      const at = f.line ? `${f.file}:${f.line}` : f.file;
      lines.push(`| \`${f.lawId}\` | ${f.severity} | \`${at}\` |`);
    }
    lines.push("");
  }
  if (report.skipped.length > 0) {
    lines.push("<details><summary>Not evaluated</summary>", "");
    for (const s of report.skipped) {
      lines.push(`- \`${s.lawId}\` — ${s.reason}${s.detail ? `: ${s.detail}` : ""}`);
    }
    lines.push("", "</details>", "");
  }
  lines.push("_Deterministic · no model · no network. Reproduce with `speclaw verify`._", "");
  return lines.join("\n");
}
