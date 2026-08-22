import fs from "node:fs";
import path from "node:path";
import { AGENTS, agentById, detectConfiguredAgents } from "../../shared/agents.js";
import { isMinimalMode, packageRoot } from "../../shared/exposure.js";
import { isGitRepo } from "../../shared/git.js";
import { readManifest } from "../../shared/manifest.js";
import { pkgName, pkgVersion } from "../../shared/version.js";
import { indexExists, openDb } from "../compass/db.js";
import { specList } from "../lawbook/engine.js";
import { globError, hasBackend, hasBatchBackend, readLawManifest } from "./laws.js";
import { redactValue } from "./redact.js";

/** Pass / warn / fail / not-applicable for a single diagnostic check. */
export type CheckStatus = "ok" | "warn" | "error" | "skip";

/** Stable section ids — never rename without bumping schemaVersion. */
export type DoctorSectionId =
  "environment" | "configuration" | "authentication" | "connectivity" | "notes";

/** One actionable diagnostic line. Stable `id` values are a public contract. */
export interface DoctorCheck {
  /** Stable id. NEVER rename: users and scripts grep for these. */
  id: string;
  title: string;
  status: CheckStatus;
  /** The measured fact, machine-readable. */
  value?: string | number | boolean | null;
  /** Human explanation of what was found. */
  detail?: string;
  /** Exact command that fixes it — required for warn/error. */
  remedy?: string;
  docs?: string;
}

/** One of the five doctor sections. */
export interface DoctorSection {
  id: DoctorSectionId;
  status: CheckStatus;
  checks: DoctorCheck[];
}

/** Versioned diagnostic report (`schemaVersion: 1`). */
export interface DoctorReport {
  schemaVersion: 1;
  generatedAt: string;
  speclaw: {
    version: string;
    mode: "full" | "minimal";
    installKind: "npx" | "local" | "global" | "unknown";
  };
  status: CheckStatus;
  redacted: boolean;
  sections: DoctorSection[];
}

/** Options for {@link doctor}. */
export interface DoctorOptions {
  /** Skip registry / network checks. */
  offline?: boolean;
  /** Redact paths (default true). */
  redact?: boolean;
}

const STATUS_RANK: Record<CheckStatus, number> = {
  skip: 0,
  ok: 1,
  warn: 2,
  error: 3,
};

/** Worst status among a list (`error` > `warn` > `ok` > `skip`). */
export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  let worst: CheckStatus = "skip";
  for (const s of statuses) {
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  }
  return worst;
}

function sectionOf(id: DoctorSectionId, checks: DoctorCheck[]): DoctorSection {
  return { id, status: worstStatus(checks.map((c) => c.status)), checks };
}

function detectInstallKind(): "npx" | "local" | "global" | "unknown" {
  const argv1 = process.argv[1] ?? "";
  if (
    argv1.includes("_npx") ||
    argv1.includes(`${path.sep}npx${path.sep}`) ||
    process.env.npm_command === "exec"
  ) {
    return "npx";
  }
  if (argv1.includes(`${path.sep}node_modules${path.sep}`)) return "local";
  if (argv1.includes(`${path.sep}bin${path.sep}`) || argv1.includes(`${path.sep}.npm-global`)) {
    return "global";
  }
  return "unknown";
}

function enginesRequirement(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot(), "package.json"), "utf8")) as {
      engines?: { node?: string };
    };
    return pkg.engines?.node ?? ">=22";
  } catch {
    return ">=22";
  }
}

function nodeSatisfies(required: string, version: string): boolean {
  const m = /^>=\s*(\d+)/.exec(required.trim());
  if (!m) return true;
  const major = parseInt(version.replace(/^v/, "").split(".")[0]!, 10);
  return major >= parseInt(m[1]!, 10);
}

function libcLabel(): string {
  if (process.platform !== "linux") return "";
  try {
    const report = (process as NodeJS.Process & { report?: { getReport?: () => unknown } }).report;
    const r = report?.getReport?.() as { header?: { glibcVersionRuntime?: string } } | undefined;
    if (r?.header?.glibcVersionRuntime) return `glibc ${r.header.glibcVersionRuntime}`;
  } catch {
    /* ignore */
  }
  return "libc unknown";
}

function push(
  checks: DoctorCheck[],
  partial: Omit<DoctorCheck, "status"> & { status: CheckStatus },
): void {
  if ((partial.status === "warn" || partial.status === "error") && !partial.remedy) {
    // Spec: no remedy → demote to notes-style ok detail rather than a false warn.
    checks.push({ ...partial, status: "ok", remedy: undefined });
    return;
  }
  checks.push(partial);
}

/** The law ids recorded as loaded into agent context, from the append-only log. */
function loadedLawIds(projectPath: string): Set<string> {
  const loaded = new Set<string>();
  try {
    const log = fs.readFileSync(path.join(projectPath, ".speclaw", "context-log.jsonl"), "utf8");
    for (const line of log.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const ids = (JSON.parse(line) as { lawIds?: string[] }).lawIds ?? [];
      for (const id of ids) loaded.add(id);
    }
  } catch {
    /* no log yet */
  }
  return loaded;
}

function readIndexedAt(projectPath: string): string | null {
  if (!indexExists(projectPath)) return null;
  try {
    const db = openDb(projectPath);
    try {
      const row = db.prepare("SELECT value FROM meta WHERE key = 'indexed_at'").get() as
        { value: string } | undefined;
      return row?.value ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function countFilesNewerThan(projectPath: string, sinceMs: number): number {
  if (!indexExists(projectPath)) return 0;
  try {
    const db = openDb(projectPath);
    try {
      const rows = db.prepare("SELECT path FROM files").all() as Array<{ path: string }>;
      let n = 0;
      for (const r of rows) {
        try {
          if (fs.statSync(path.join(projectPath, r.path)).mtimeMs > sinceMs) n++;
        } catch {
          /* deleted */
        }
      }
      return n;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

function environmentChecks(): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const required = enginesRequirement();
  const okNode = nodeSatisfies(required, process.version);
  push(checks, {
    id: "env.node",
    title: "node",
    status: okNode ? "ok" : "error",
    value: process.version,
    detail: `${process.version} (requires ${required})`,
    remedy: okNode ? undefined : `Install Node.js ${required} (https://nodejs.org)`,
  });

  const libc = libcLabel();
  push(checks, {
    id: "env.platform",
    title: "platform",
    status: "ok",
    value: `${process.platform} ${process.arch}`,
    detail: [process.platform, process.arch, libc].filter(Boolean).join(" "),
  });

  // Filled by caller with projectPath — placeholder; see buildEnvironment.
  return checks;
}

function buildEnvironment(projectPath: string): DoctorCheck[] {
  const checks = environmentChecks();
  const git = isGitRepo(projectPath);
  push(checks, {
    id: "env.git",
    title: "git",
    status: git ? "ok" : "warn",
    value: git,
    detail: git ? "repository" : "not a git repository",
    remedy: git ? undefined : "git init",
  });

  push(checks, {
    id: "env.ast-engine",
    title: "ast engine",
    status: "skip",
    detail: "@ast-grep/napi not shipped yet — skip until executable-laws wires it",
    remedy: "speclaw update",
  });

  return checks;
}

function symlinkChecks(projectPath: string): DoctorCheck {
  const has = (rel: string) => fs.existsSync(path.join(projectPath, rel));
  const configured = AGENTS.filter((a) => detectConfiguredAgents(projectPath).includes(a.id));
  if (configured.length === 0) {
    return {
      id: "cfg.symlinks",
      title: "agent surfaces",
      status: "warn",
      detail: "none configured",
      remedy: "speclaw init",
    };
  }

  const broken: string[] = [];
  let linkCount = 0;
  for (const agent of configured) {
    for (const target of agent.linkTargets) {
      if (!has(path.join("ai-specs", target))) continue;
      const linkPath = path.join(projectPath, agent.ideDir, target);
      linkCount++;
      try {
        const stat = fs.lstatSync(linkPath);
        if (stat.isSymbolicLink()) {
          if (!fs.existsSync(linkPath)) broken.push(`${agent.ideDir}/${target}`);
        }
      } catch {
        broken.push(`${agent.ideDir}/${target}`);
      }
    }
  }

  if (broken.length) {
    return {
      id: "cfg.symlinks",
      title: "agent surfaces",
      status: "error",
      value: broken.join(", "),
      detail: `${configured.length} configured · broken: ${broken.join(", ")}`,
      remedy: "speclaw update",
    };
  }

  return {
    id: "cfg.symlinks",
    title: "agent surfaces",
    status: "ok",
    detail: `${configured.length} configured, ${linkCount} link(s) intact`,
  };
}

async function mcpCheckAsync(projectPath: string, agentId: string): Promise<DoctorCheck> {
  const agent = agentById(agentId)!;
  const id = `cfg.mcp.${agentId}`;
  const title = `mcp · ${agentId}`;

  if (!agent.mcpFile) {
    return {
      id,
      title,
      status: "skip",
      detail: `${agent.label} has no MCP config surface`,
    };
  }

  const mcpPath = path.join(projectPath, agent.mcpFile);
  if (!fs.existsSync(mcpPath)) {
    return {
      id,
      title,
      status: "warn",
      detail: "not configured",
      remedy: `speclaw agent add ${agentId}`,
    };
  }

  let entry: { command?: string; args?: string[] } | undefined;
  try {
    const cfg = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
      mcpServers?: Record<string, { command?: string; args?: string[] }>;
    };
    entry = cfg.mcpServers?.speclaw;
  } catch {
    return {
      id,
      title,
      status: "warn",
      detail: "MCP config unreadable",
      remedy: `speclaw agent add ${agentId}`,
    };
  }

  if (!entry) {
    return {
      id,
      title,
      status: "warn",
      detail: "not configured (no speclaw server entry)",
      remedy: `speclaw agent add ${agentId}`,
    };
  }

  try {
    const { collectRegisteredTools } = await import("./context-budget.js");
    const tools = collectRegisteredTools(isMinimalMode(projectPath));
    return {
      id,
      title,
      status: "ok",
      value: tools.length,
      detail: `reachable (self-probe), ${tools.length} tools`,
    };
  } catch (err) {
    return {
      id,
      title,
      status: "warn",
      detail: `configured but probe failed: ${(err as Error).message}`,
      remedy: `speclaw agent add ${agentId}`,
    };
  }
}

/** Semver compare — true when `latest` is strictly newer than `current`. */
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .split("-")[0]!
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

async function fetchLatestVersion(name: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const url = `https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function lawsCheck(projectPath: string): DoctorCheck {
  const manifest = readLawManifest(projectPath);
  if (!manifest) {
    return {
      id: "cfg.laws",
      title: "laws",
      status: "warn",
      detail: "manifest missing",
      remedy: "speclaw update",
    };
  }

  const badGlobs: string[] = [];
  for (const law of manifest.laws) {
    for (const pattern of law.scope) {
      const err = globError(pattern);
      if (err) badGlobs.push(`${law.id}: ${pattern}`);
    }
  }
  if (badGlobs.length) {
    return {
      id: "cfg.laws",
      title: "laws",
      status: "error",
      detail: `invalid globs: ${badGlobs.join("; ")}`,
      remedy: "Fix scope globs in .speclaw/laws-manifest.json",
    };
  }

  const withPath = manifest.laws.filter(hasBackend).length;
  const withBatch = manifest.laws.filter(hasBatchBackend).length;
  return {
    id: "cfg.laws",
    title: "laws",
    status: "ok",
    value: manifest.laws.length,
    detail: `${manifest.laws.length} declared · ${withPath} path · ${withBatch} deps/graph · 0 invalid`,
  };
}

async function budgetCheck(projectPath: string): Promise<DoctorCheck> {
  try {
    const { measureInstallBudget } = await import("./context-budget.js");
    const m = measureInstallBudget(projectPath);
    return {
      id: "cfg.budget",
      title: "context cost",
      status: "ok",
      value: m.total,
      detail: `~${m.total} always-on tokens (${m.profile}, ${m.toolCount} tools)`,
    };
  } catch (err) {
    return {
      id: "cfg.budget",
      title: "context cost",
      status: "skip",
      detail: `could not measure: ${(err as Error).message}`,
      remedy: "speclaw budget",
    };
  }
}

function freshnessCheck(projectPath: string): DoctorCheck {
  if (!indexExists(projectPath)) {
    return {
      id: "cfg.index.freshness",
      title: "index freshness",
      status: "warn",
      detail: "no index",
      remedy: "speclaw index",
    };
  }
  const indexedAt = readIndexedAt(projectPath);
  if (!indexedAt) {
    return {
      id: "cfg.index.freshness",
      title: "index freshness",
      status: "skip",
      detail: "meta.indexed_at absent (index from an older speclaw)",
      remedy: "speclaw index",
    };
  }
  const sinceMs = Date.parse(indexedAt);
  if (Number.isNaN(sinceMs)) {
    return {
      id: "cfg.index.freshness",
      title: "index freshness",
      status: "skip",
      detail: "meta.indexed_at unparseable",
      remedy: "speclaw index",
    };
  }
  const ageDays = (Date.now() - sinceMs) / (24 * 60 * 60 * 1000);
  const changed = countFilesNewerThan(projectPath, sinceMs);
  const stale = ageDays > 7 && changed > 0;
  return {
    id: "cfg.index.freshness",
    title: "index freshness",
    status: stale ? "warn" : "ok",
    value: Math.floor(ageDays),
    detail: `${Math.floor(ageDays)} day(s) old · ${changed} file(s) newer than index`,
    remedy: stale ? "speclaw index" : undefined,
  };
}

function specsOrphansCheck(projectPath: string): DoctorCheck {
  const list = specList(projectPath);
  if (!list.initialized) {
    return {
      id: "cfg.specs.orphans",
      title: "specs",
      status: "skip",
      detail: "lawbook not initialised",
      remedy: "speclaw lawbook init",
    };
  }
  const active = list.activeChanges;
  if (active.length === 0) {
    return {
      id: "cfg.specs.orphans",
      title: "specs",
      status: "ok",
      detail: "no active changes",
    };
  }
  return {
    id: "cfg.specs.orphans",
    title: "specs",
    status: "warn",
    value: active.join(", "),
    detail: `${active.length} change(s) not archived: ${active.join(", ")}`,
    remedy: `speclaw lawbook archive ${active[0]}`,
  };
}

function configurationChecks(projectPath: string, initialised: boolean): DoctorCheck[] {
  if (!initialised) {
    const ids = [
      "cfg.manifest",
      "cfg.ownership",
      "cfg.symlinks",
      "cfg.hooks",
      "cfg.laws",
      "cfg.budget",
      "cfg.index.freshness",
      "cfg.specs.orphans",
    ] as const;
    return ids.map((id) => ({
      id,
      title: id.replace(/^cfg\./, ""),
      status: "skip" as const,
      detail: "project not initialised",
      remedy: "speclaw init",
    }));
  }

  const checks: DoctorCheck[] = [];
  const manifest = readManifest(projectPath);
  push(checks, {
    id: "cfg.manifest",
    title: "manifest",
    status: manifest ? "ok" : "warn",
    detail: manifest ? `.speclaw.json (written by ${manifest.version})` : "missing .speclaw.json",
    remedy: manifest ? undefined : "speclaw init",
  });

  push(checks, {
    id: "cfg.ownership",
    title: "managed files",
    status: "skip",
    detail: "content-hash inventory not available yet — skip",
    remedy: "speclaw update",
  });

  checks.push(symlinkChecks(projectPath));

  push(checks, {
    id: "cfg.hooks",
    title: "hooks",
    status: "skip",
    detail: "see notes.compact / law context coverage — no dedicated hooks probe yet",
    remedy: "speclaw update",
  });

  checks.push(lawsCheck(projectPath));
  // budget + mcp + freshness + specs filled async by caller
  return checks;
}

function notesSection(projectPath: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const loaded = loadedLawIds(projectPath);
  const manifest = readLawManifest(projectPath);
  const declared = manifest?.laws.map((l) => l.id) ?? [];
  const missing = declared.filter((id) => !loaded.has(id));

  push(checks, {
    id: "notes.compact",
    title: "post-compact rules",
    status: "ok",
    detail:
      "Rules with `paths:` are NOT re-injected after a context compact. " +
      (manifest
        ? `${declared.length - missing.length}/${declared.length} laws seen in context-log.`
        : "No law manifest."),
  });

  const configured = detectConfiguredAgents(projectPath);
  const caps = AGENTS.map((a) => {
    const on = configured.includes(a.id);
    return `${a.id}: hooks=${a.hooks ? "yes" : "no"} mcp=${a.mcpFile ? "yes" : "no"}${on ? " (configured)" : ""}`;
  });
  push(checks, {
    id: "notes.capabilities",
    title: "agent capabilities",
    status: "ok",
    detail: caps.join("; "),
  });

  return checks;
}

/**
 * Build the versioned diagnostic report for a project.
 *
 * @param projectPath - Absolute project root.
 * @param opts - Offline / redaction options.
 */
export async function doctor(projectPath: string, opts: DoctorOptions = {}): Promise<DoctorReport> {
  const redact = opts.redact !== false;
  const offline = Boolean(opts.offline);
  const initialised =
    Boolean(readManifest(projectPath)) || fs.existsSync(path.join(projectPath, "LAWS.md"));

  const environment = buildEnvironment(projectPath);
  const configuration = configurationChecks(projectPath, initialised);

  if (initialised) {
    configuration.push(await budgetCheck(projectPath));
    configuration.push(freshnessCheck(projectPath));
    configuration.push(specsOrphansCheck(projectPath));

    const configured = detectConfiguredAgents(projectPath);
    const mcpAgents = AGENTS.filter((a) => a.mcpFile && configured.includes(a.id));
    if (mcpAgents.length === 0) {
      // Still report one representative unconfigured surface when agents exist without mcp.
      const withMcp = AGENTS.filter((a) => a.mcpFile);
      for (const a of withMcp.slice(0, 1)) {
        configuration.push(await mcpCheckAsync(projectPath, a.id));
      }
    } else {
      for (const a of mcpAgents) {
        configuration.push(await mcpCheckAsync(projectPath, a.id));
      }
    }
  }

  const authentication: DoctorCheck[] = [
    {
      id: "auth.none",
      title: "credentials",
      status: "ok",
      detail: "none — speclaw stores no credentials and runs fully local",
    },
  ];

  const connectivity: DoctorCheck[] = [];
  if (offline) {
    connectivity.push({
      id: "conn.registry",
      title: "npm registry",
      status: "skip",
      detail: "skipped (--offline)",
      remedy: "speclaw doctor",
    });
  } else {
    const current = pkgVersion();
    const latest = await fetchLatestVersion(pkgName());
    if (!latest) {
      connectivity.push({
        id: "conn.registry",
        title: "npm registry",
        status: "skip",
        detail: "registry unreachable",
        remedy: "speclaw doctor --offline",
      });
    } else if (isNewerVersion(latest, current)) {
      connectivity.push({
        id: "conn.registry",
        title: "npm registry",
        status: "warn",
        value: latest,
        detail: `${current} installed, ${latest} available`,
        remedy: "npx @esneiderbravo/speclaw@latest update",
      });
    } else {
      connectivity.push({
        id: "conn.registry",
        title: "npm registry",
        status: "ok",
        detail: `${current} installed (latest)`,
      });
    }
  }

  connectivity.push({
    id: "conn.egress",
    title: "outbound requests",
    status: "ok",
    value: 1,
    detail:
      "1 possible: npm version check (disable with --offline). No analytics, no authenticated calls.",
  });

  const notes = notesSection(projectPath);

  const sections: DoctorSection[] = [
    sectionOf("environment", environment),
    sectionOf("configuration", configuration),
    sectionOf("authentication", authentication),
    sectionOf("connectivity", connectivity),
    sectionOf("notes", notes),
  ];

  let report: DoctorReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    speclaw: {
      version: pkgVersion(),
      mode: isMinimalMode(projectPath) ? "minimal" : "full",
      installKind: detectInstallKind(),
    },
    status: worstStatus(sections.map((s) => s.status)),
    redacted: redact,
    sections,
  };

  if (redact) {
    report = redactValue(report, projectPath);
    report.redacted = true;
  }

  return report;
}

/**
 * Flatten checks for legacy callers that still expect a name/ok/detail list.
 * Prefer {@link doctor} + {@link DoctorReport}.
 */
export function flattenChecks(
  report: DoctorReport,
): Array<{ name: string; ok: boolean; detail: string }> {
  const out: Array<{ name: string; ok: boolean; detail: string }> = [];
  for (const section of report.sections) {
    for (const c of section.checks) {
      out.push({
        name: c.id,
        ok: c.status === "ok" || c.status === "skip",
        detail: c.detail ?? c.status,
      });
    }
  }
  return out;
}
