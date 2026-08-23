import fs from "node:fs";
import path from "node:path";
import { ALIAS_TARGETS } from "./tool-catalog.js";

const LOG_NAME = "deprecated-calls.jsonl";

/** Append-only log of deprecated alias invocations under `.speclaw/`. */
export function logDeprecatedCall(projectPath: string, alias: string): void {
  const target = ALIAS_TARGETS[alias];
  if (!target) return;
  const dir = path.join(projectPath, ".speclaw");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      alias,
      replacement: target,
    });
    fs.appendFileSync(path.join(dir, LOG_NAME), line + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

/** Read recent deprecated alias counts for doctor. */
export function readDeprecatedCallCounts(projectPath: string): Map<string, number> {
  const counts = new Map<string, number>();
  const file = path.join(projectPath, ".speclaw", LOG_NAME);
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as { alias?: string };
      if (row.alias) counts.set(row.alias, (counts.get(row.alias) ?? 0) + 1);
    }
  } catch {
    /* no log */
  }
  return counts;
}

const SCAN_PATHS = ["CLAUDE.md", "AGENTS.md", "LAWS.md", "docs/compass.md"] as const;
const SCAN_DIRS = [".cursor/rules", ".claude/rules", "ai-specs/rules"] as const;

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...listMarkdownFiles(full));
      else if (ent.name.endsWith(".md")) out.push(full);
    }
  } catch {
    /* missing dir */
  }
  return out;
}

/** Find personalized files that still cite retired MCP tool names. */
export function scanRetiredToolReferences(
  projectPath: string,
): Array<{ file: string; alias: string; replacement: string }> {
  const files = new Set<string>();
  for (const rel of SCAN_PATHS) {
    const full = path.join(projectPath, rel);
    if (fs.existsSync(full)) files.add(full);
  }
  for (const rel of SCAN_DIRS) {
    for (const full of listMarkdownFiles(path.join(projectPath, rel))) files.add(full);
  }

  const hits: Array<{ file: string; alias: string; replacement: string }> = [];
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const [alias, replacement] of Object.entries(ALIAS_TARGETS)) {
      if (text.includes(alias)) {
        hits.push({ file: path.relative(projectPath, file), alias, replacement });
      }
    }
  }
  return hits;
}

const REMOVAL_VERSION = "0.6.0";

/**
 * Prefix a tool response when invoked through a deprecated alias.
 *
 * @param alias - Retired tool name.
 * @param body - Serialized response body.
 */
export function prefixDeprecated(alias: string, body: string): string {
  const target = ALIAS_TARGETS[alias] ?? "see canonical tools";
  return `[deprecated] ${alias} → ${target}. Retiring in ${REMOVAL_VERSION}.\n\n${body}`;
}
