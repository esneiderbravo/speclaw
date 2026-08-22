import fs from "node:fs";
import path from "node:path";
import { isMinimalMode, loadDeclaredBudget, packageRoot, type DeclaredBudget } from "./exposure.js";
import { toolDefinitionTokens, type ToolDefForBudget } from "./schema-tokens.js";
import { estimateTokens } from "./tokens.js";

/** Per-surface and total measurement result. */
export interface BudgetMeasurement {
  tools: number;
  skillsAndCommands: number;
  alwaysOnInstructions: number;
  pathScoped: number;
  total: number;
  profile: "full" | "minimal";
  toolCount: number;
  details: {
    tools: Array<{ name: string; tokens: number }>;
    skillsAndCommands: Array<{ path: string; tokens: number }>;
    alwaysOn: Array<{ path: string; tokens: number }>;
    pathScoped: Array<{ path: string; tokens: number }>;
  };
}

export interface MeasureBudgetOptions {
  /** Project root for instruction / skill / rule files. */
  projectPath?: string;
  /** Package / repo root that holds speclaw assets and token-budget.json. */
  packagePath?: string;
  /** Pre-collected tool defs (e.g. from captureTools). */
  tools?: ToolDefForBudget[];
  /** Force profile instead of detecting from env/manifest. */
  minimal?: boolean;
}

/**
 * Measure always-on context cost across the four surfaces.
 *
 * @param opts - Paths and optional pre-collected tool definitions.
 * @returns Structured measurement; `total` excludes path-scoped surface D.
 */
export function measureBudget(opts: MeasureBudgetOptions = {}): BudgetMeasurement {
  const projectPath = opts.projectPath ?? process.cwd();
  const packagePath = opts.packagePath ?? packageRoot();
  const minimal = opts.minimal ?? isMinimalMode(projectPath);

  const toolDefs = opts.tools ?? [];
  const toolDetails = toolDefs.map((t) => ({
    name: t.name,
    tokens: toolDefinitionTokens(t),
  }));
  const tools = toolDetails.reduce((s, t) => s + t.tokens, 0);

  const skillRoots = [
    path.join(packagePath, "src/modules/lawbook/assets/skills"),
    path.join(packagePath, "dist/modules/lawbook/assets/skills"),
    path.join(projectPath, "ai-specs/skills"),
  ];
  const commandRoots = [
    path.join(packagePath, "src/modules/lawbook/assets/commands"),
    path.join(packagePath, "dist/modules/lawbook/assets/commands"),
    path.join(projectPath, "ai-specs/commands"),
  ];

  const skillFiles = firstExistingFiles(skillRoots, (dir) => collectSkillBudgetFiles(dir));
  const commandFiles = firstExistingFiles(commandRoots, (dir) =>
    listFilesRecursive(dir).filter((f) => f.endsWith(".md")),
  );

  const scDetails = [...skillFiles, ...commandFiles].map((f) => ({
    path: path.relative(packagePath, f) || path.relative(projectPath, f) || f,
    tokens: estimateTokens(safeRead(f)),
  }));
  const skillsAndCommands = scDetails.reduce((s, x) => s + x.tokens, 0);

  const alwaysOnPaths = ["CLAUDE.md", "AGENTS.md", "LAWS.md", "docs/compass.md"].map((rel) =>
    path.join(projectPath, rel),
  );
  const alwaysOnDetails = alwaysOnPaths
    .filter((p) => fs.existsSync(p))
    .map((p) => ({
      path: path.relative(projectPath, p),
      tokens: estimateTokens(safeRead(p)),
    }));
  const alwaysOnInstructions = alwaysOnDetails.reduce((s, x) => s + x.tokens, 0);

  const pathScopedDetails = collectPathScoped(projectPath);
  const pathScoped = pathScopedDetails.reduce((s, x) => s + x.tokens, 0);

  return {
    tools,
    skillsAndCommands,
    alwaysOnInstructions,
    pathScoped,
    total: tools + skillsAndCommands + alwaysOnInstructions,
    profile: minimal ? "minimal" : "full",
    toolCount: toolDefs.length,
    details: {
      tools: toolDetails,
      skillsAndCommands: scDetails,
      alwaysOn: alwaysOnDetails,
      pathScoped: pathScopedDetails,
    },
  };
}

/**
 * Format a human-readable budget table.
 *
 * @param m - Measurement.
 * @param declared - Optional declared ceilings for an ok/over column.
 */
export function formatBudgetTable(m: BudgetMeasurement, declared?: DeclaredBudget): string {
  const d = declared ?? loadDeclaredBudget();
  const row = (label: string, tokens: number, cap: number | null) => {
    const capStr = cap === null ? "—".padStart(8) : String(cap).padStart(8);
    const status = cap === null ? "" : tokens <= cap ? "  ok" : "  OVER";
    return `${label.padEnd(40)} ${String(tokens).padStart(8)} ${capStr}${status}`;
  };
  const lines = [
    "Superficie                              tokens   presupuesto",
    row(`A  tools MCP (${m.toolCount}, ${m.profile})`, m.tools, d.surfaces.tools),
    row("B  skills + commands", m.skillsAndCommands, d.surfaces.skillsAndCommands),
    row("C  always-on instructions", m.alwaysOnInstructions, d.surfaces.alwaysOnInstructions),
    row("D  path-scoped rules", m.pathScoped, null),
    `${"".padEnd(40)} ${"──────".padStart(8)} ${"──────".padStart(8)}`,
    row("TOTAL always-on", m.total, m.profile === "minimal" ? d.minimal.total : d.total),
  ];
  return lines.join("\n");
}

function safeRead(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

/** Skill budget: dispatcher SKILL.md + only that counts for B's "loaded at turn" description;
 * for always-present skill index we count SKILL.md bodies (dispatchers) fully and step files
 * are loaded on demand — still include step files in B per design (commands full; skills
 * frontmatter+description each turn). For simplicity and honesty we count entire SKILL.md
 * (dispatcher) and do NOT count steps/ toward always-on B (JIT). */
function collectSkillBudgetFiles(skillsRoot: string): string[] {
  if (!fs.existsSync(skillsRoot)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(skillsRoot, entry.name, "SKILL.md");
    if (fs.existsSync(skillMd)) files.push(skillMd);
  }
  return files;
}

function firstExistingFiles(roots: string[], collect: (dir: string) => string[]): string[] {
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const files = collect(root);
    if (files.length) return files;
  }
  return [];
}

function collectPathScoped(projectPath: string): Array<{ path: string; tokens: number }> {
  const details: Array<{ path: string; tokens: number }> = [];
  const ruleDirs = [
    path.join(projectPath, ".claude/rules"),
    path.join(projectPath, "ai-specs/rules"),
  ];
  for (const dir of ruleDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of listFilesRecursive(dir).filter((p) => p.endsWith(".md"))) {
      const body = safeRead(f);
      // Heuristic: frontmatter with paths: means path-scoped lazy load.
      if (/^---[\s\S]*?^paths:\s*$/m.test(body) || /^---[\s\S]*?^paths:/m.test(body)) {
        details.push({
          path: path.relative(projectPath, f),
          tokens: estimateTokens(body),
        });
      }
    }
  }
  return details;
}

/** Re-export for callers that already have Zod tool shapes. */
export type { ToolDefForBudget };
