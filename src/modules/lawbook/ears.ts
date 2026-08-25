/**
 * EARS (Easy Approach to Requirements Syntax) classifier and suggestor.
 * File I/O is limited to loading optional knobs from lawbook/config.yaml.
 * Does not rewrite requirement files.
 */

import fs from "node:fs";
import path from "node:path";

export type EarsPattern =
  "ubiquitous" | "event" | "state" | "unwanted" | "optional" | "complex" | "unstructured";

export type EarsSeverity = "error" | "warn" | "info";

export interface EarsParts {
  trigger?: string;
  state?: string;
  condition?: string;
  feature?: string;
  response?: string;
}

export interface EarsClassification {
  pattern: EarsPattern;
  parts: EarsParts;
  modal: "SHALL" | "MUST" | "SHALL NOT" | "MUST NOT" | null;
  normalized: string;
}

export interface EarsDiagnostic {
  code: string;
  severity: EarsSeverity;
  message: string;
  suggestion?: string;
}

export interface EarsConfig {
  severity: "strict" | "lenient";
  vagueWords: string[];
  silentCodes: string[];
}

export const DEFAULT_EARS_CONFIG: EarsConfig = {
  severity: "strict",
  vagueWords: [
    "appropriately",
    "properly",
    "as needed",
    "efficiently",
    "user-friendly",
    "robust",
    "adecuadamente",
    "correctamente",
  ],
  silentCodes: [],
};

export interface PropertyRunner {
  id: string;
  languages: string[];
  patterns: string[];
  minRuns?: number;
}

export const DEFAULT_PROPERTY_RUNNERS: PropertyRunner[] = [
  {
    id: "fast-check",
    languages: ["ts", "js"],
    patterns: ["fc.assert(", "fc.property(", "fc.asyncProperty("],
    minRuns: 25,
  },
  {
    id: "hypothesis",
    languages: ["py"],
    patterns: ["@given(", "@settings("],
    minRuns: 25,
  },
  {
    id: "schemathesis",
    languages: ["py"],
    patterns: ["schemathesis.", "@schema.parametrize("],
  },
];

const MODAL_RE = /\b(SHALL(?:\s+NOT)?|MUST(?:\s+NOT)?)\b/gi;
const MODAL = String.raw`(?:SHALL|MUST)(?:\s+NOT)?`;

/**
 * Collapse whitespace and strip simple markdown emphasis for matching.
 *
 * @param text - Raw requirement body.
 */
export function normalizeRequirementText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function findModal(normalized: string): EarsClassification["modal"] {
  const m = /\b(SHALL(?:\s+NOT)?|MUST(?:\s+NOT)?)\b/i.exec(normalized);
  if (!m) return null;
  return m[1]!.toUpperCase().replace(/\s+/g, " ") as EarsClassification["modal"];
}

/**
 * Classify a requirement's normative body into an EARS pattern.
 *
 * Precedence: complex → unwanted → state → event → optional → ubiquitous → unstructured.
 *
 * @param text - Normative prose (not the heading alone).
 */
// Covers: req~ears-validate~1
export function classifyEars(text: string): EarsClassification {
  const normalized = normalizeRequirementText(text);
  const modal = findModal(normalized);
  if (!normalized) {
    return { pattern: "unstructured", parts: {}, modal: null, normalized };
  }

  // Complex: two distinct EARS preconditions (WHILE/WHEN/WHERE/IF) before the modal.
  // THEN is part of unwanted IF…THEN — it must not trigger "complex" alone.
  const complex = new RegExp(
    String.raw`^(?:WHILE|WHEN|WHERE|IF)\b.*\b(?:WHILE|WHEN|WHERE|IF)\b.*\b${MODAL}\b`,
    "i",
  );
  if (complex.test(normalized)) {
    return { pattern: "complex", parts: { response: normalized }, modal, normalized };
  }

  const unwanted = new RegExp(
    String.raw`^IF\b(?<condition>.+?),?\s*THEN\b(?<response>.+\b${MODAL}\b.+)$`,
    "i",
  );
  const uw = unwanted.exec(normalized);
  if (uw?.groups) {
    return {
      pattern: "unwanted",
      parts: {
        condition: uw.groups["condition"]?.trim(),
        response: uw.groups["response"]?.trim(),
      },
      modal,
      normalized,
    };
  }

  const state = new RegExp(
    String.raw`^WHILE\b(?<state>.+?),\s*(?<response>.+\b${MODAL}\b.+)$`,
    "i",
  );
  const st = state.exec(normalized);
  if (st?.groups) {
    return {
      pattern: "state",
      parts: { state: st.groups["state"]?.trim(), response: st.groups["response"]?.trim() },
      modal,
      normalized,
    };
  }

  const event = new RegExp(
    String.raw`^WHEN\b(?<trigger>.+?),\s*(?<response>.+\b${MODAL}\b.+)$`,
    "i",
  );
  const ev = event.exec(normalized);
  if (ev?.groups) {
    return {
      pattern: "event",
      parts: {
        trigger: ev.groups["trigger"]?.trim(),
        response: ev.groups["response"]?.trim(),
      },
      modal,
      normalized,
    };
  }

  const optional = new RegExp(
    String.raw`^WHERE\b(?<feature>.+?),\s*(?<response>.+\b${MODAL}\b.+)$`,
    "i",
  );
  const op = optional.exec(normalized);
  if (op?.groups) {
    return {
      pattern: "optional",
      parts: {
        feature: op.groups["feature"]?.trim(),
        response: op.groups["response"]?.trim(),
      },
      modal,
      normalized,
    };
  }

  const ubiquitous = new RegExp(String.raw`^(?!WHEN\b|WHILE\b|WHERE\b|IF\b).*\b${MODAL}\b.+`, "i");
  if (ubiquitous.test(normalized)) {
    return { pattern: "ubiquitous", parts: { response: normalized }, modal, normalized };
  }

  return { pattern: "unstructured", parts: {}, modal, normalized };
}

/**
 * Emit diagnostics for a classified requirement.
 *
 * @param classification - Result of `classifyEars`.
 * @param opts - Scenario presence and ears config.
 */
export function diagnoseEars(
  classification: EarsClassification,
  opts: { hasScenarios?: boolean; config?: EarsConfig } = {},
): EarsDiagnostic[] {
  const cfg = opts.config ?? DEFAULT_EARS_CONFIG;
  const hasScenarios = opts.hasScenarios ?? true;
  const out: EarsDiagnostic[] = [];
  const push = (d: EarsDiagnostic) => {
    if (cfg.silentCodes.includes(d.code)) return;
    out.push(d);
  };

  const { normalized, pattern, modal } = classification;

  if (!modal) {
    push({
      code: "ears/no-modal",
      severity: "error",
      message: "Requirement has no SHALL/MUST modal — it is not a normative obligation.",
      suggestion: suggestEars(normalized),
    });
  }

  if (pattern === "unstructured" && modal) {
    push({
      code: "ears/unstructured",
      severity: cfg.severity === "strict" ? "error" : "warn",
      message: "Requirement does not fit an EARS mold (WHEN/WHILE/IF…THEN/WHERE/ubiquitous).",
      suggestion: suggestEars(normalized),
    });
  }

  const modalCount = [...normalized.matchAll(MODAL_RE)].length;
  if (modalCount > 1) {
    push({
      code: "ears/multiple-modals",
      severity: "warn",
      message: `Found ${modalCount} modals — consider splitting into separate requirements.`,
    });
  }

  const hasIf = /\bIF\b/i.test(normalized);
  const hasThen = /\bTHEN\b/i.test(normalized);
  if (hasThen && !hasIf) {
    push({
      code: "ears/then-without-if",
      severity: "error",
      message: "THEN present without an opening IF.",
      suggestion: suggestEars(normalized),
    });
  }
  if (hasIf && !hasThen && pattern !== "complex") {
    // IF…THEN unwanted requires THEN; bare IF mid-sentence is common English — only
    // flag when the body starts with IF.
    if (/^IF\b/i.test(normalized)) {
      push({
        code: "ears/if-without-then",
        severity: "error",
        message: "IF at the start of the requirement without THEN.",
        suggestion: suggestEars(normalized),
      });
    }
  }

  for (const word of cfg.vagueWords) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(normalized)) {
      push({
        code: "ears/vague-response",
        severity: "warn",
        message: `'${word}' is not an observable acceptance criterion — what would a test assert?`,
      });
      break;
    }
  }

  if (
    /\bshall be\b/i.test(normalized) &&
    !/\bthe (system|cli|tool|agent|archive|index)\b/i.test(normalized)
  ) {
    push({
      code: "ears/passive-voice",
      severity: "info",
      message: "Response may be passive ('shall be …') — name the actor when possible.",
    });
  }

  if (!hasScenarios) {
    push({
      code: "ears/no-scenarios",
      severity: "warn",
      message: "Requirement has no #### Scenario: acceptance criteria.",
    });
  }

  return out;
}

/**
 * Deterministic rewrite suggestion. Never writes files.
 *
 * @param text - Raw or normalized requirement body.
 */
export function suggestEars(text: string): string {
  const normalized = normalizeRequirementText(text);
  if (!normalized) return "The <system> SHALL <response>.";

  const modalMatch = /\b(SHALL(?:\s+NOT)?|MUST(?:\s+NOT)?)\b/i.exec(normalized);
  if (!modalMatch) {
    return `The system SHALL ${normalized.replace(/\.$/, "")}.`;
  }

  const modalIdx = modalMatch.index!;
  const before = normalized
    .slice(0, modalIdx)
    .trim()
    .replace(/[,:]+$/, "")
    .trim();
  const after = normalized.slice(modalIdx).trim();

  if (!before) {
    return after.endsWith(".") ? after : `${after}.`;
  }

  const lower = before.toLowerCase();
  if (
    /\b(during|while|mientras|whilst)\b/.test(lower) ||
    /\bing\b/.test(lower.split(/\s+/).slice(-1)[0] ?? "")
  ) {
    return `WHILE ${before}, ${after.endsWith(".") ? after : `${after}.`}`;
  }
  if (/\b(fail|invalid|error|missing|denied|unauthorized|no\b)/i.test(before)) {
    return `IF ${before}, THEN ${after.endsWith(".") ? after : `${after}.`}`;
  }
  if (/\b(enabled|included|feature|capability|flag|opt-?in)\b/i.test(before)) {
    return `WHERE ${before}, ${after.endsWith(".") ? after : `${after}.`}`;
  }
  return `WHEN ${before}, ${after.endsWith(".") ? after : `${after}.`}`;
}

/**
 * Extract normative prose from a requirement block (between heading and scenarios/keywords).
 *
 * @param block - Full requirement section including heading line.
 */
export function extractNormativeBody(block: string): {
  body: string;
  hasScenarios: boolean;
} {
  const lines = block.split(/\r?\n/);
  // skip heading
  const bodyLines: string[] = [];
  let hasScenarios = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^####\s+Scenario:/i.test(line)) {
      hasScenarios = true;
      break;
    }
    if (/^###?\s+/.test(line) && !/^####\s+/.test(line)) break;
    if (/^(Status|Needs|Tags|Depends|Covers|Verification)\s*:/i.test(line)) continue;
    if (/^`req~/.test(line.trim())) continue;
    bodyLines.push(line);
  }
  return { body: bodyLines.join("\n").trim(), hasScenarios };
}

/**
 * Split a markdown spec into requirement blocks starting at each `### Requirement:`.
 *
 * @param content - Full spec markdown.
 */
export function splitRequirementBlocks(content: string): Array<{
  heading: string;
  line: number;
  block: string;
}> {
  const lines = content.split(/\r?\n/);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+Requirement:/i.test(lines[i]!)) starts.push(i);
  }
  const out: Array<{ heading: string; line: number; block: string }> = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s]!;
    const end = s + 1 < starts.length ? starts[s + 1]! : lines.length;
    const blockLines = lines.slice(start, end);
    const heading = blockLines[0] ?? "";
    out.push({ heading, line: start + 1, block: blockLines.join("\n") });
  }
  return out;
}

/**
 * True when a source window near a coverage link invokes a known property runner.
 *
 * @param source - Full file text.
 * @param line - 1-based line of the Covers comment (or link).
 * @param runners - Configured runners.
 * @param window - Lines to scan after `line` (inclusive of line).
 */
export function detectPropertyRunnerInWindow(
  source: string,
  line: number,
  runners: PropertyRunner[],
  window = 6,
): { runnerId: string } | null {
  const lines = source.split(/\r?\n/);
  const from = Math.max(0, line - 1);
  const to = Math.min(lines.length, from + window);
  for (let i = from; i < to; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Skip full-line comments (TS/JS/Python).
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      continue;
    }
    for (const runner of runners) {
      for (const pat of runner.patterns) {
        if (lineHasRunnerCall(raw, pat)) return { runnerId: runner.id };
      }
    }
  }
  return null;
}

/** Match a runner call that is not inside a string/template quote. */
function lineHasRunnerCall(raw: string, pat: string): boolean {
  let idx = 0;
  while ((idx = raw.indexOf(pat, idx)) !== -1) {
    const before = idx > 0 ? raw[idx - 1]! : "";
    if (before !== '"' && before !== "'" && before !== "`") return true;
    idx += pat.length;
  }
  return false;
}

/**
 * Load ears severity / vague words / silent codes from lawbook/config.yaml.
 * Line-oriented subset (no YAML dependency). Defaults to strict.
 */
export function loadEarsConfig(projectPath: string): EarsConfig {
  const cfg: EarsConfig = structuredClone(DEFAULT_EARS_CONFIG);
  const cfgPath = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfgPath)) return cfg;
  const text = fs.readFileSync(cfgPath, "utf8");
  const sev = /^\s*severity\s*:\s*(strict|lenient)\s*$/im.exec(text);
  // Prefer nested `ears:` block severity when present; fall back to first match.
  const earsBlock = /(?:^|\n)ears:\s*\n((?:[ \t]+.+\n?)*)/i.exec(text);
  const block = earsBlock?.[1] ?? text;
  const sev2 = /^\s*severity\s*:\s*(strict|lenient)\s*$/im.exec(block);
  if (sev2) cfg.severity = sev2[1]!.toLowerCase() as "strict" | "lenient";
  else if (sev) cfg.severity = sev[1]!.toLowerCase() as "strict" | "lenient";

  const vague = /^\s*vagueWords\s*:\s*\[([^\]]*)\]\s*$/im.exec(block);
  if (vague) {
    cfg.vagueWords = vague[1]!
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  const silent = /^\s*silentCodes\s*:\s*\[([^\]]*)\]\s*$/im.exec(block);
  if (silent) {
    cfg.silentCodes = silent[1]!
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return cfg;
}

/**
 * Load property runner patterns from lawbook/config.yaml, or defaults.
 */
export function loadPropertyRunners(projectPath: string): PropertyRunner[] {
  const cfgPath = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfgPath)) return structuredClone(DEFAULT_PROPERTY_RUNNERS);
  const text = fs.readFileSync(cfgPath, "utf8");
  // Keep defaults; optional override via a flat `propertyRunnerPatterns:` list
  // of substrings (shared across runners) for simple projects.
  const flat = /^\s*propertyRunnerPatterns\s*:\s*\[([^\]]*)\]\s*$/im.exec(text);
  if (!flat) return structuredClone(DEFAULT_PROPERTY_RUNNERS);
  const patterns = flat[1]!
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  if (patterns.length === 0) return structuredClone(DEFAULT_PROPERTY_RUNNERS);
  return [
    {
      id: "configured",
      languages: ["ts", "js", "py"],
      patterns,
      minRuns: 25,
    },
  ];
}
