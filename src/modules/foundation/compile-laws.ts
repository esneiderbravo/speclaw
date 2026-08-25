import fs from "node:fs";
import path from "node:path";
import {
  type Law,
  type LawManifest,
  globError,
  isActiveLaw,
  readLawManifest,
  seedManifest,
  writeLawManifest,
} from "./laws.js";
import { parseLawsFromStandards } from "./laws-parse.js";
import {
  agentsmdDialect,
  claudeRulesDialect,
  coderabbitDialect,
  copilotDialect,
  cursorMdcDialect,
  patchDelimited,
  type CompiledArtifact,
  type Dialect,
} from "./dialects/index.js";
import { detectConfiguredAgents } from "../../shared/agents.js";
import { digestText, provenanceBlock, refreshLockfile } from "./lock.js";

export interface CompileReport {
  schemaVersion: 1;
  written: string[];
  unchanged: string[];
  failed: Array<{ path: string; error: string }>;
  lawCount: number;
  draftCount: number;
}

const DIALECTS: Dialect[] = [
  claudeRulesDialect,
  cursorMdcDialect,
  copilotDialect,
  coderabbitDialect,
  agentsmdDialect,
];

/**
 * Merge seed + standards parse + on-disk manifest. Manifest wins on id conflict.
 * Throws if standards declare duplicate ids.
 */
export function mergeLawSources(projectPath: string): Law[] {
  const parsed = parseLawsFromStandards(projectPath);
  if (parsed.duplicates.size > 0) {
    const detail = [...parsed.duplicates.entries()]
      .map(([id, locs]) => `${id} at ${locs.join(" and ")}`)
      .join("; ");
    throw new Error(`duplicate law id(s) in docs/standards: ${detail}`);
  }

  const byId = new Map<string, Law>();
  for (const law of seedManifest().laws) byId.set(law.id, law);
  for (const law of parsed.laws) {
    if (!byId.has(law.id)) byId.set(law.id, law);
  }
  const disk = readLawManifest(projectPath);
  if (disk) {
    for (const law of disk.laws) byId.set(law.id, law);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function validateScopes(laws: Law[]): void {
  for (const law of laws) {
    if (!isActiveLaw(law)) continue;
    for (const p of law.scope) {
      const err = globError(p);
      if (err) {
        throw new Error(
          `${law.id}: invalid scope ${JSON.stringify(p)} (${err}) — ${law.source.file}${law.source.line ? `:${law.source.line}` : ""}`,
        );
      }
    }
  }
}

function writeIfChanged(
  projectPath: string,
  abs: string,
  contents: string,
  report: CompileReport,
): void {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const rel = path.relative(projectPath, abs).split(path.sep).join("/");
  if (fs.existsSync(abs)) {
    const prev = fs.readFileSync(abs, "utf8");
    if (prev === contents) {
      report.unchanged.push(rel);
      return;
    }
  }
  fs.writeFileSync(abs, contents);
  report.written.push(rel);
}

/** Append a data-only provenance block when missing; body digest stays stable. */
function withProvenance(contents: string, lawIds: string[]): string {
  const body = contents.replace(
    /<!-- speclaw:begin-provenance[\s\S]*?speclaw:end-provenance -->\n?/g,
    "",
  );
  const dig = digestText(body);
  const base = body.endsWith("\n") ? body : body + "\n";
  return base + provenanceBlock({ lawIds, digest: dig, source: "compile" });
}

function mergeCoderabbit(
  projectPath: string,
  abs: string,
  payloadJson: string,
  report: CompileReport,
): void {
  const payload = JSON.parse(payloadJson) as {
    path_instructions: Array<{ path: string; instructions: string }>;
  };
  let text = fs.existsSync(abs)
    ? fs.readFileSync(abs, "utf8")
    : "reviews:\n  path_instructions: []\n";
  const start = "# speclaw:path_instructions:start";
  const end = "# speclaw:path_instructions:end";
  const blockLines = [start];
  for (const e of payload.path_instructions) {
    blockLines.push(`  - path: ${JSON.stringify(e.path)}`);
    blockLines.push(`    instructions: ${JSON.stringify(e.instructions)}`);
  }
  blockLines.push(end);
  const block = blockLines.join("\n");
  const re = /# speclaw:path_instructions:start[\s\S]*?# speclaw:path_instructions:end/;
  if (re.test(text)) text = text.replace(re, block);
  else {
    if (!/path_instructions\s*:/.test(text)) {
      if (!/^reviews\s*:/m.test(text)) text = `reviews:\n  path_instructions: []\n` + text;
      else text = text.replace(/^(reviews\s*:)/m, `$1\n  path_instructions: []`);
    }
    text = text.trimEnd() + "\n" + block + "\n";
  }
  writeIfChanged(projectPath, abs, text.endsWith("\n") ? text : text + "\n", report);
}

function ensureClaudeRulesSymlink(projectPath: string, report: CompileReport): void {
  const link = path.join(projectPath, ".claude", "rules", "speclaw");
  const target = path.join("..", "..", "ai-specs", "rules");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try {
    if (fs.lstatSync(link).isSymbolicLink() || fs.existsSync(link)) {
      report.unchanged.push(".claude/rules/speclaw");
      return;
    }
  } catch {
    /* missing */
  }
  try {
    fs.symlinkSync(target, link);
    report.written.push(".claude/rules/speclaw");
  } catch (err) {
    report.failed.push({ path: ".claude/rules/speclaw", error: (err as Error).message });
  }
}

function applyArtifact(projectPath: string, art: CompiledArtifact, report: CompileReport): void {
  const abs = path.join(projectPath, art.path);
  try {
    if (art.mode === "write") {
      // Nested AGENTS: only write if parent has package.json
      if (art.path.endsWith("/AGENTS.md") && art.path !== "AGENTS.md") {
        const dir = path.dirname(abs);
        if (!fs.existsSync(path.join(dir, "package.json"))) return;
      }
      const body =
        art.path.endsWith(".md") || art.path.endsWith(".mdc")
          ? withProvenance(art.contents, art.lawIds)
          : art.contents;
      writeIfChanged(projectPath, abs, body, report);
      return;
    }
    if (art.mode === "patch-delimited") {
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      const next = patchDelimited(prev, art.marker ?? "laws", art.contents);
      writeIfChanged(projectPath, abs, next, report);
      return;
    }
    if (art.mode === "merge-yaml-path-instructions") {
      mergeCoderabbit(projectPath, abs, art.contents, report);
    }
  } catch (err) {
    report.failed.push({ path: art.path, error: (err as Error).message });
  }
}

export interface CompileLawsOptions {
  projectPath: string;
  /** Persist merged active+draft laws back to the manifest. Default true. */
  writeManifest?: boolean;
  agents?: string[];
}

/**
 * Compile project laws into agent dialects. Deterministic and idempotent.
 */
export function compileLaws(opts: CompileLawsOptions): CompileReport {
  const projectPath = opts.projectPath;
  const report: CompileReport = {
    schemaVersion: 1,
    written: [],
    unchanged: [],
    failed: [],
    lawCount: 0,
    draftCount: 0,
  };

  const laws = mergeLawSources(projectPath);
  validateScopes(laws);
  report.lawCount = laws.filter(isActiveLaw).length;
  report.draftCount = laws.filter((l) => !isActiveLaw(l)).length;

  if (opts.writeManifest !== false) {
    const manifest: LawManifest = { version: 1, laws };
    writeLawManifest(projectPath, manifest);
  }

  const agents = opts.agents ?? detectConfiguredAgents(projectPath);
  const ctx = { projectPath, agents };

  const artifacts: CompiledArtifact[] = [];
  for (const d of DIALECTS) artifacts.push(...d.compile(laws, ctx));

  // Filter nested AGENTS without package.json before write
  for (const art of artifacts) {
    if (art.path.endsWith("/AGENTS.md") && art.path !== "AGENTS.md") {
      const dir = path.join(projectPath, path.dirname(art.path));
      if (!fs.existsSync(path.join(dir, "package.json"))) continue;
    }
    applyArtifact(projectPath, art, report);
  }

  if (agents.includes("claude")) ensureClaudeRulesSymlink(projectPath, report);

  // Covers: req~lock-refresh-update~1
  try {
    refreshLockfile(projectPath);
  } catch {
    // Lock refresh must not fail compile; `speclaw laws lock` surfaces errors.
  }

  return report;
}

/** Estimate always-on tokens (empty scope) with a bytes/3.6 heuristic. */
export function estimateAlwaysOnTokens(laws: Law[]): {
  total: number;
  top: Array<{ id: string; tokens: number }>;
} {
  const HEADER = 12;
  const scored = laws
    .filter((l) => isActiveLaw(l) && l.scope.length === 0)
    .map((l) => ({
      id: l.id,
      tokens: Math.ceil(Buffer.byteLength(l.prose, "utf8") / 3.6) + HEADER,
    }))
    .sort((a, b) => b.tokens - a.tokens);
  return {
    total: scored.reduce((s, x) => s + x.tokens, 0),
    top: scored.slice(0, 3),
  };
}
