import fs from "node:fs";
import path from "node:path";
import { RETIRED_TOOLS } from "./tool-catalog.js";

const SCAN_PATHS = ["CLAUDE.md", "AGENTS.md", "LAWS.md", "docs/compass.md"] as const;
const SCAN_DIRS = [
  ".cursor/rules",
  ".claude/rules",
  "ai-specs/rules",
  "ai-specs/skills",
  "ai-specs/agents",
] as const;

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
    for (const [alias, replacement] of Object.entries(RETIRED_TOOLS)) {
      if (text.includes(alias)) {
        hits.push({ file: path.relative(projectPath, file), alias, replacement });
      }
    }
  }
  return hits;
}
