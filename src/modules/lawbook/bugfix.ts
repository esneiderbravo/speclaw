import fs from "node:fs";
import path from "node:path";
import {
  gatherSignals,
  loadCeremonyConfig,
  proposeLevel,
  setCeremonyLevel,
  type CeremonyProposal,
  type CeremonyRecord,
  type CeremonyTargets,
  writeCeremonyRecord,
  type ChangeType,
} from "./levels.js";
import type { InvestigateResult } from "./investigate.js";

export const BUGFIX_HEADINGS = [
  "1. Observed symptom",
  "2. Minimal reproduction",
  "3. Root cause",
  "4. Blast radius",
  "5. Proposed fix",
  "6. Regression test",
  "7. Prevention",
] as const;

export type BugResolution = "fixed" | "mitigated" | "not-a-bug";

/** Parsed section bodies keyed by heading label. */
export function parseBugfixSections(content: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of content.split(/^##\s+/m).slice(1)) {
    const nl = part.indexOf("\n");
    if (nl < 0) {
      out.set(part.trim(), "");
      continue;
    }
    out.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  return out;
}

function sectionBody(sections: Map<string, string>, key: string): string {
  for (const [h, b] of sections) {
    if (h.toLowerCase().startsWith(key.toLowerCase())) return b;
  }
  return "";
}

function isFilled(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  if (/^n\/a\s*:/i.test(t)) return true;
  return t.length > 2;
}

/** True when prevention says a canonical requirement was missing. */
export function preventionRequiresDelta(content: string): boolean {
  const prev = sectionBody(parseBugfixSections(content), "7. Prevention");
  if (!prev) return false;
  return (
    /\b(requirement|spec)\b.*\b(miss|missing|absent|incomplete|add|update)\b/i.test(prev) ||
    /\bfaltaba\b/i.test(prev) ||
    /\bmissing requirement\b/i.test(prev)
  );
}

/** Infer archive resolution from bugfix.md content. */
export function inferBugResolution(content: string): BugResolution {
  if (/\bnot-a-bug\b/i.test(content) || /resolution:\s*not-a-bug/i.test(content)) {
    return "not-a-bug";
  }
  const repro = sectionBody(parseBugfixSections(content), "2. Minimal reproduction");
  if (/unreproducible\s*:/i.test(repro)) return "mitigated";
  return "fixed";
}

/**
 * Validate bugfix.md sections for a ceremony level.
 *
 * @returns Human-readable issues (empty when valid).
 */
export function validateBugfixContent(level: number, content: string): string[] {
  const issues: string[] = [];
  const sections = parseBugfixSections(content);
  for (const h of BUGFIX_HEADINGS) {
    if (!sections.has(h) && ![...sections.keys()].some((k) => k.startsWith(h.split(".")[0]!))) {
      issues.push(`bugfix.md missing heading "## ${h}"`);
    }
  }

  const repro = sectionBody(sections, "2. Minimal reproduction");
  if (!isFilled(repro) && !/unreproducible\s*:/i.test(repro)) {
    issues.push("bugfix.md §2 requires reproduction steps or an `unreproducible:` block");
  }

  const requiredAt0 = [
    "1. Observed symptom",
    "2. Minimal reproduction",
    "3. Root cause",
    "5. Proposed fix",
    "6. Regression test",
  ];
  const optionalAt0 = ["4. Blast radius", "7. Prevention"];
  const allRequired = level >= 1 ? [...BUGFIX_HEADINGS] : requiredAt0;

  for (const key of allRequired) {
    const body = sectionBody(sections, key);
    if (!isFilled(body) && !/unreproducible\s*:/i.test(body)) {
      issues.push(`bugfix.md §${key.split(".")[0]} (${key}) is empty`);
    }
  }

  if (level === 0) {
    for (const key of optionalAt0) {
      const body = sectionBody(sections, key);
      if (body && !isFilled(body) && !/^n\/a\s*:/i.test(body)) {
        issues.push(`bugfix.md §${key.split(".")[0]} must be filled or start with \`n/a:\``);
      }
    }
  }

  const prevention = sectionBody(sections, "7. Prevention");
  const resolution = inferBugResolution(content);
  if (resolution === "not-a-bug" && !isFilled(prevention)) {
    issues.push("not-a-bug resolution requires a prevention entry (usually a spec clarity fix)");
  } else if (level >= 1 && !isFilled(prevention)) {
    issues.push(
      "bugfix.md §7 Prevention must be answered (law, spec gap, or explicit none with reason)",
    );
  }

  const regression = sectionBody(sections, "6. Regression test");
  const mitigated = /unreproducible\s*:/i.test(repro);
  if (!mitigated && !isFilled(regression)) {
    issues.push("bugfix.md §6 Regression test is required unless reproduction is unreproducible");
  }
  if (mitigated && !isFilled(regression) && !/\binstrument/i.test(content)) {
    issues.push(
      "unreproducible bugs require instrumentation (§6 or explicit instrumentation reference)",
    );
  }

  return issues;
}

function bugfixTemplate(name: string, level: number, seed?: Partial<InvestigateResult>): string {
  const symptom =
    seed?.inputSymptom ??
    "<What you see: error message, wrong value, screenshot reference. Do not interpret yet.>";
  const root =
    seed?.suspects?.[0] != null
      ? `${seed.suspects[0].name} (${seed.suspects[0].file}:${seed.suspects[0].startLine}) **(candidate — verify)**`
      : "<symbol (file:line) — must resolve against the graph>";
  const blast =
    seed?.blastRadiusSummary ??
    "<Run compass_impact on the confirmed root cause; list modules and call sites.>";

  return `# Bugfix: ${name}

**Level:** ${level} · **Type:** bug · **Severity:** normal

## 1. Observed symptom
${symptom}

## 2. Minimal reproduction
<!-- Steps to reproduce, or \`unreproducible: <reason and what was tried>\` -->

## 3. Root cause
${root}

## 4. Blast radius
${blast}

## 5. Proposed fix
<!-- The change; note discarded alternatives if any. -->

## 6. Regression test
<!-- test/path.test.ts::case name — must fail BEFORE the fix -->

## 7. Prevention
<!-- New law (executable-laws block), missing spec requirement, or "none: <reason>" -->
`;
}

/**
 * Scaffold a bug change: `bugfix.md`, `change.json`, and `reports/`.
 */
export function scaffoldBugfix(
  projectPath: string,
  name: string,
  opts: {
    level?: 0 | 1 | 2 | 3;
    targets?: CeremonyTargets;
    seed?: Partial<InvestigateResult>;
  } = {},
): { change: string; proposal: CeremonyProposal; record: CeremonyRecord; dir: string } {
  const changeDir = path.join(projectPath, "lawbook", "changes", name);
  if (fs.existsSync(changeDir)) {
    throw new Error(`change "${name}" already exists under lawbook/changes/`);
  }
  const targets = opts.targets ?? { paths: [], symbols: [] };
  const { thresholds } = loadCeremonyConfig(projectPath);
  const signals = gatherSignals(projectPath, targets, thresholds);
  const proposal = proposeLevel(signals, thresholds);
  const level = opts.level ?? (proposal.level !== null && proposal.level <= 1 ? proposal.level : 1);

  fs.mkdirSync(path.join(changeDir, "reports"), { recursive: true });
  fs.writeFileSync(path.join(changeDir, "bugfix.md"), bugfixTemplate(name, level, opts.seed));
  fs.writeFileSync(
    path.join(changeDir, "reports", "README.md"),
    `# Reports — ${name}\n\nBug reports MUST include the regression test **failing before the fix**.\n`,
  );

  if (level >= 1) {
    fs.writeFileSync(
      path.join(changeDir, "tasks.md"),
      `- [ ] Reproduce and confirm root cause\n- [ ] Implement fix\n- [ ] Add regression test (red before, green after)\n- [ ] Complete prevention §7\n- [ ] Write discipline report under reports/\n`,
    );
  }
  if (level >= 2) {
    fs.writeFileSync(
      path.join(changeDir, "design.md"),
      `# Design — ${name}\n\n## Approach\n\n(structural bugfix — document the fix architecture)\n`,
    );
  }

  const record = setCeremonyLevel(projectPath, name, {
    proposal,
    level,
    confirmedBy: "human",
  });
  const updated: typeof record & { changeType: ChangeType } = { ...record, changeType: "bug" };
  writeCeremonyRecord(projectPath, name, updated);
  return { change: name, proposal, record: updated, dir: changeDir };
}

/** Read change type from an archived folder path. */
export function readChangeTypeFromDir(changeDir: string): ChangeType {
  const p = path.join(changeDir, "change.json");
  if (!fs.existsSync(p)) return "feature";
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { changeType?: ChangeType };
    return raw.changeType === "bug" ? "bug" : "feature";
  } catch {
    return "feature";
  }
}
