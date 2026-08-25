import type { Law } from "../laws.js";

/** Dialect identifiers speclaw can emit. */
export type DialectId =
  "agentsmd" | "claude-rules" | "cursor-mdc" | "copilot-instructions" | "coderabbit";

export interface CompileContext {
  projectPath: string;
  /** Agents configured in the project (ids from AgentDef). */
  agents: string[];
}

export interface CompiledArtifact {
  /** Project-relative POSIX path. */
  path: string;
  contents: string;
  lawIds: string[];
  /** How to write: create/overwrite managed file, or patch delimited region. */
  mode: "write" | "patch-delimited" | "merge-yaml-path-instructions";
  /** Delimiter name for patch-delimited (e.g. `laws`). */
  marker?: string;
}

export interface Dialect {
  id: DialectId;
  compile(laws: Law[], ctx: CompileContext): CompiledArtifact[];
}

/** YAML-ish frontmatter for markdown rule files. */
export function frontmatter(fields: Record<string, string | boolean | string[]>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${JSON.stringify(item)}`);
    } else if (typeof v === "boolean") {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

/** HTML comment markers for delimited patches in personalized files. */
export function delimit(marker: string, body: string): string {
  return `<!-- speclaw:${marker}:start -->\n${body.trim()}\n<!-- speclaw:${marker}:end -->\n`;
}

/**
 * Replace or append a delimited speclaw block inside `existing` text.
 * Preserves all content outside the markers.
 */
export function patchDelimited(existing: string, marker: string, body: string): string {
  const block = delimit(marker, body);
  const re = new RegExp(
    `<!--\\s*speclaw:${marker}:start\\s-->[\\s\\S]*?<!--\\s*speclaw:${marker}:end\\s-->\\n?`,
    "m",
  );
  if (re.test(existing)) return existing.replace(re, block);
  const sep = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
  return `${existing}${sep}\n${block}`;
}

/** Stable filename slug from a law id (`law~foo~1` → `law-foo-1`). */
export function lawSlug(id: string): string {
  return id.replace(/~/g, "-").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

/** Longest common directory prefix of scope globs (best-effort). */
export function commonPrefix(scopes: string[]): string {
  const dirs = scopes
    .map((s) =>
      s
        .replace(/\\/g, "/")
        .replace(/\*\*.*$/, "")
        .replace(/\/$/, ""),
    )
    .filter((s) => s.length > 0 && !s.includes("*"));
  if (dirs.length === 0) return "";
  const parts = dirs[0]!.split("/");
  let i = 0;
  for (; i < parts.length; i++) {
    const p = parts[i]!;
    if (!dirs.every((d) => d.split("/")[i] === p)) break;
  }
  return parts.slice(0, i).join("/");
}
