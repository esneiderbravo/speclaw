import fs from "node:fs";
import path from "node:path";
import type { Law } from "./laws.js";
import { readLawManifest, writeLawManifest } from "./laws.js";

export interface ImportReport {
  imported: string[];
  skipped: string[];
}

/**
 * Import rulesync-style markdown rules under `.rulesync/` or `rulesync/` into
 * draft semantic laws and append them to the manifest.
 */
export function importRulesFrom(projectPath: string, from: string): ImportReport {
  if (from !== "rulesync") {
    throw new Error(`unsupported import source "${from}" — try rulesync`);
  }
  const candidates = [".rulesync", "rulesync", ".rulesync/rules", "rulesync/rules"];
  let root: string | null = null;
  for (const c of candidates) {
    const abs = path.join(projectPath, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      root = abs;
      break;
    }
  }
  if (!root) {
    throw new Error("no rulesync rules directory found (.rulesync/ or rulesync/)");
  }

  const report: ImportReport = { imported: [], skipped: [] };
  const existing = readLawManifest(projectPath) ?? { version: 1, laws: [] as Law[] };
  const have = new Set(existing.laws.map((l) => l.id));

  const walk = (dir: string): void => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/\.(md|mdc)$/i.test(ent.name)) continue;
      const rel = path.relative(projectPath, abs).split(path.sep).join("/");
      const prose = fs.readFileSync(abs, "utf8").trim() || "(empty rule)";
      const slug = ent.name
        .replace(/\.(md|mdc)$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const id = `law~import-rulesync-${slug}~1`;
      if (have.has(id)) {
        report.skipped.push(id);
        continue;
      }
      const law: Law = {
        id,
        title: `Imported: ${ent.name}`,
        severity: "warn",
        scope: [],
        prose,
        verification: { kind: "semantic" },
        enforcement: "feedback",
        source: { file: rel, line: 1 },
        status: "draft",
      };
      existing.laws.push(law);
      have.add(id);
      report.imported.push(id);
    }
  };
  walk(root);
  writeLawManifest(projectPath, existing);
  return report;
}
