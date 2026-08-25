import fs from "node:fs";
import path from "node:path";
import type { Enforcement, Law, Severity, Verification } from "./laws.js";

/**
 * Parse laws declared in markdown via HTML comment blocks:
 *
 * ```html
 * <!-- speclaw:law
 * id: law~example~1
 * title: Example
 * severity: warn
 * scope: src/**\/*.ts
 * enforcement: feedback
 * verification: semantic
 * -->
 * Prose that follows until the next heading or comment.
 * ```
 */

const BLOCK_RE = /<!--\s*speclaw:law\b([\s\S]*?)-->/gi;

export interface ParseLawsResult {
  laws: Law[];
  /** Duplicate id → list of `file:line` sources. */
  duplicates: Map<string, string[]>;
}

function parseMeta(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([a-zA-Z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!.toLowerCase()] = m[2]!;
  }
  return out;
}

function verificationOf(kind: string | undefined): Verification {
  switch (kind) {
    case "path":
      return { kind: "path" };
    case "ast":
      return { kind: "ast" };
    case "deps":
      return { kind: "deps", rule: { from: "^", to: "^", type: "forbidden" } };
    case "graph":
      return { kind: "graph", rule: { circular: true } };
    case "process":
      return { kind: "process" };
    case "traceability":
      return { kind: "traceability" };
    case "none":
      return { kind: "none" };
    case "semantic":
    default:
      return { kind: "semantic" };
  }
}

function proseAfter(content: string, endIndex: number): string {
  const rest = content.slice(endIndex);
  const next = rest.search(/\n#{1,3}\s|\n<!--\s*speclaw:law\b/i);
  const chunk = (next === -1 ? rest : rest.slice(0, next)).trim();
  return chunk.replace(/^#+\s*.*$/m, "").trim() || "(no prose)";
}

/**
 * Parse one markdown file for `speclaw:law` blocks.
 *
 * @param fileRel - Project-relative path recorded on each law's `source`.
 * @param content - File contents.
 */
export function parseLawsFromMarkdown(fileRel: string, content: string): Law[] {
  const laws: Law[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(BLOCK_RE.source, "gi");
  while ((m = re.exec(content)) !== null) {
    const meta = parseMeta(m[1] ?? "");
    const id = meta.id?.trim();
    if (!id) continue;
    const line = content.slice(0, m.index).split(/\r?\n/).length;
    const scope = (meta.scope ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const severity = (meta.severity ?? "warn") as Severity;
    const enforcement = (meta.enforcement ?? "feedback") as Enforcement;
    const title = meta.title?.trim() || id;
    const prose = proseAfter(content, m.index + m[0].length);
    laws.push({
      id,
      title,
      severity: ["error", "warn", "info"].includes(severity) ? severity : "warn",
      scope,
      prose,
      verification: verificationOf(meta.verification),
      enforcement: ["bloqueo", "feedback", "gate"].includes(enforcement) ? enforcement : "feedback",
      source: { file: fileRel, line },
      status: meta.status === "draft" ? "draft" : "active",
    });
  }
  return laws;
}

/**
 * Walk `docs/standards/**\/*.md` under the project and parse law blocks.
 * Collects duplicate ids across files into {@link ParseLawsResult.duplicates}.
 */
export function parseLawsFromStandards(projectPath: string): ParseLawsResult {
  const root = path.join(projectPath, "docs", "standards");
  const laws: Law[] = [];
  const seen = new Map<string, string[]>();
  if (!fs.existsSync(root)) return { laws, duplicates: seen };

  const walk = (dir: string): void => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!ent.name.endsWith(".md")) continue;
      const rel = path.relative(projectPath, abs).split(path.sep).join("/");
      const content = fs.readFileSync(abs, "utf8");
      for (const law of parseLawsFromMarkdown(rel, content)) {
        const locs = seen.get(law.id) ?? [];
        locs.push(`${law.source.file}:${law.source.line ?? "?"}`);
        seen.set(law.id, locs);
        laws.push(law);
      }
    }
  };
  walk(root);

  const duplicates = new Map<string, string[]>();
  for (const [id, locs] of seen) {
    if (locs.length > 1) duplicates.set(id, locs);
  }
  // Keep first occurrence of each id in `laws` when reporting merge later;
  // callers must fail if duplicates.size > 0.
  return { laws, duplicates };
}
