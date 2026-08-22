import fs from "node:fs";
import path from "node:path";
import { openDb } from "./db.js";
import { estimateTokens } from "../../shared/tokens.js";
import { loadDeclaredBudget } from "../../shared/exposure.js";

export const MAP_START = "<!-- speclaw:map:start -->";
export const MAP_END = "<!-- speclaw:map:end -->";

/**
 * Build a compact project map (hubs + top-level layout) from the Compass DB.
 * Truncates to the declared map token budget.
 *
 * @param projectPath - Project root with `.speclaw/index.db`.
 * @returns Map body text (no markers), or null if the index is missing/empty.
 */
export function generateCompactMap(projectPath: string): string | null {
  const dbPath = path.join(projectPath, ".speclaw", "index.db");
  if (!fs.existsSync(dbPath)) return null;

  const db = openDb(projectPath);
  try {
    const fileCount = (db.prepare("SELECT COUNT(*) AS c FROM files").get() as { c: number }).c;
    const nodeCount = (db.prepare("SELECT COUNT(*) AS c FROM nodes").get() as { c: number }).c;
    if (fileCount === 0) return null;

    const hubs = db
      .prepare(
        `SELECT n.name AS name, COUNT(*) AS fan_in
         FROM edges e
         JOIN nodes n ON n.id = e.dst_node_id
         WHERE e.kind = 'call' AND e.dst_node_id IS NOT NULL
         GROUP BY n.id
         ORDER BY fan_in DESC
         LIMIT 12`,
      )
      .all() as Array<{ name: string; fan_in: number }>;

    const topDirs = db
      .prepare(
        `SELECT CASE
           WHEN instr(path, '/') > 0 THEN substr(path, 1, instr(path, '/') - 1)
           ELSE path
         END AS top, COUNT(*) AS c
         FROM files
         GROUP BY top
         ORDER BY c DESC
         LIMIT 8`,
      )
      .all() as Array<{ top: string; c: number }>;

    const hubLine =
      hubs.length === 0
        ? "hubs: (none yet)"
        : `hubs: ${hubs.map((h) => `${h.name} ${h.fan_in}`).join(" · ")}`;

    const dirLine = topDirs.map((d) => `${d.top}/ (${d.c})`).join("  ");

    let body = [
      `speclaw · ${fileCount} files · ${nodeCount} nodes`,
      dirLine,
      hubLine,
      "entry: src/server.ts (mcp) · src/cli/index.ts (bin)",
    ].join("\n");

    const cap = loadDeclaredBudget().map;
    let omitted = false;
    while (estimateTokens(body) > cap && hubs.length > 3) {
      hubs.pop();
      omitted = true;
      const shorter =
        hubs.length === 0
          ? "hubs: (truncated)"
          : `hubs: ${hubs.map((h) => `${h.name} ${h.fan_in}`).join(" · ")}`;
      body = [
        `speclaw · ${fileCount} files · ${nodeCount} nodes`,
        dirLine,
        shorter,
        "entry: src/server.ts (mcp) · src/cli/index.ts (bin)",
        omitted ? "(entries omitted to fit map budget)" : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (estimateTokens(body) > cap) {
      body = [
        `speclaw · ${fileCount} files · ${nodeCount} nodes`,
        "entry: src/server.ts (mcp) · src/cli/index.ts (bin)",
        "(entries omitted to fit map budget)",
      ].join("\n");
    }
    return body;
  } finally {
    db.close();
  }
}

export interface WriteMapResult {
  written: boolean;
  reason?: string;
}

/**
 * Replace content between map markers in `docs/compass.md`. Preserves content
 * outside markers. Does nothing (with reason) when markers are missing or the
 * map cannot be generated.
 *
 * @param projectPath - Project root.
 */
export function writeCompactMap(projectPath: string): WriteMapResult {
  const compassPath = path.join(projectPath, "docs", "compass.md");
  if (!fs.existsSync(compassPath)) {
    return { written: false, reason: "docs/compass.md missing" };
  }
  const original = fs.readFileSync(compassPath, "utf8");
  const start = original.indexOf(MAP_START);
  const end = original.indexOf(MAP_END);
  if (start < 0 || end < 0 || end < start) {
    return { written: false, reason: "map markers missing — not regenerating" };
  }

  const map = generateCompactMap(projectPath);
  if (!map) {
    // Leave markers but clear body so we don't leave a stale map.
    const next = original.slice(0, start + MAP_START.length) + "\n" + original.slice(end);
    if (next !== original) fs.writeFileSync(compassPath, next);
    return { written: false, reason: "no index or empty graph — map omitted" };
  }

  const next =
    original.slice(0, start + MAP_START.length) + "\n" + map + "\n" + original.slice(end);
  fs.writeFileSync(compassPath, next);
  return { written: true };
}
