import fs from "node:fs";
import path from "node:path";
import { AGENTS, agentById, detectConfiguredAgents } from "../../shared/agents.js";
import { globError, hasBackend, hasBatchBackend, readLawManifest } from "./laws.js";

/** A single health-check line with a pass/fail verdict and remediation hint. */
interface Check {
  name: string;
  ok: boolean;
  /** Human-readable status or "missing — <how to fix>" guidance. */
  detail: string;
}

/**
 * Run the speclaw installation health checks against a project: ai-specs and
 * LAWS.md presence, agent contracts, the docs/standards set, per-agent IDE
 * symlink health, the lawbook/ workflow, the Compass index, and .mcp.json wiring.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns One {@link Check} per verified item, each carrying a remediation hint.
 */
export function doctor(projectPath: string): Check[] {
  const checks: Check[] = [];
  const has = (rel: string) => fs.existsSync(path.join(projectPath, rel));

  checks.push({
    name: "ai-specs directory",
    ok: has("ai-specs"),
    detail: has("ai-specs") ? "present" : "missing — run the scaffold tool first",
  });

  checks.push({
    name: "LAWS.md constitution",
    ok: has("LAWS.md"),
    detail: has("LAWS.md") ? "present" : "missing — the project has no law",
  });

  for (const entry of ["CLAUDE.md", "AGENTS.md", "docs/compass.md"]) {
    checks.push({
      name: `${entry} agent contract`,
      ok: has(entry),
      detail: has(entry) ? "present" : "missing — scaffold writes it",
    });
  }

  const standards = [
    "base-standards",
    "architecture",
    "backend-standards",
    "frontend-standards",
    "testing-standards",
    "documentation",
    "conventions",
    "lawbook",
  ];
  const missingStandards = standards.filter((s) => !has(path.join("docs/standards", `${s}.md`)));
  checks.push({
    name: "docs/standards/*",
    ok: missingStandards.length === 0,
    detail:
      missingStandards.length === 0
        ? `all ${standards.length} standards present`
        : `missing: ${missingStandards.join(", ")}`,
  });

  // Only check the agents the user actually configured — selection is opt-in.
  const configured = AGENTS.filter((a) => detectConfiguredAgents(projectPath).includes(a.id));
  if (configured.length === 0) {
    checks.push({
      name: "agents",
      ok: false,
      detail: "none configured — run `speclaw init` or `speclaw agent add <id>`",
    });
  }
  for (const agent of configured) {
    for (const target of agent.linkTargets) {
      // only demand links for content that actually exists in ai-specs/
      if (!has(path.join("ai-specs", target))) continue;
      const ideDir = agent.ideDir;
      const linkPath = path.join(projectPath, ideDir, target);
      let ok = false;
      let detail = "missing";
      try {
        const stat = fs.lstatSync(linkPath);
        if (stat.isSymbolicLink()) {
          ok = fs.existsSync(linkPath); // broken symlink -> false
          detail = ok ? `-> ${fs.readlinkSync(linkPath)}` : "broken symlink";
        } else {
          ok = true;
          detail = "real directory (not a symlink — consider migrating to ai-specs)";
        }
      } catch {
        // stays missing
      }
      checks.push({ name: `${ideDir}/${target}`, ok, detail });
    }
  }

  checks.push({
    name: "lawbook workflow",
    ok: has("lawbook"),
    detail: has("lawbook") ? "lawbook/ present" : "missing — run the `lawbook_init` tool",
  });

  checks.push({
    name: "Compass index",
    ok: has(".speclaw/index.db"),
    detail: has(".speclaw/index.db")
      ? ".speclaw/index.db present"
      : "missing — run the `compass_index` tool",
  });

  checks.push({
    name: ".mcp.json wiring",
    ok: has(".mcp.json"),
    detail: has(".mcp.json") ? "present" : "missing — scaffold writes it",
  });

  lawEnforcementChecks(projectPath, checks);

  return checks;
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
    // No log yet — hooks have not recorded any context loads.
  }
  return loaded;
}

/**
 * Append the law-enforcement health checks: manifest presence and backend
 * coverage, glob validity (caught here rather than at runtime), context-coverage
 * with the post-compact caveat, and the agents where blocking laws don't apply.
 */
function lawEnforcementChecks(projectPath: string, checks: Check[]): void {
  const manifest = readLawManifest(projectPath);
  if (!manifest) {
    checks.push({
      name: "law manifest",
      ok: false,
      detail: "missing — run `speclaw init`/`update` to seed .speclaw/laws-manifest.json",
    });
    return;
  }

  const withPath = manifest.laws.filter(hasBackend);
  const withBatch = manifest.laws.filter(hasBatchBackend);
  const noBackend = manifest.laws.filter((l) => !hasBackend(l) && !hasBatchBackend(l));
  checks.push({
    name: "law manifest",
    ok: true,
    detail:
      `${manifest.laws.length} law(s): ${withPath.length} enforced (path), ` +
      `${withBatch.length} verified (deps/graph)` +
      (noBackend.length
        ? `, ${noBackend.length} declared without a backend yet (${noBackend
            .map((l) => l.id)
            .join(", ")})`
        : ""),
  });

  // Graph-engine availability — the deps/graph backends need the Compass index.
  if (withBatch.length > 0) {
    const indexed = fs.existsSync(path.join(projectPath, ".speclaw", "index.db"));
    checks.push({
      name: "graph law engines",
      ok: indexed,
      detail: indexed
        ? `index present — ${withBatch.length} deps/graph law(s) evaluable via \`speclaw laws verify\``
        : `${withBatch.length} deps/graph law(s) will be skipped (no-index) — run the \`compass_index\` tool`,
    });
  }

  // Glob validation — a malformed scope glob must fail loudly here, never
  // silently match zero files at runtime. (A malformed deps/graph regex is
  // rejected earlier, when the manifest is validated, so a manifest that reaches
  // here has none.)
  const badGlobs: string[] = [];
  for (const law of manifest.laws) {
    for (const pattern of law.scope) {
      const err = globError(pattern);
      if (err) badGlobs.push(`${law.id}: ${pattern} (${err})`);
    }
  }
  checks.push({
    name: "law scope globs",
    ok: badGlobs.length === 0,
    detail: badGlobs.length === 0 ? "all valid" : `malformed: ${badGlobs.join("; ")}`,
  });

  // Context coverage — which laws actually entered the agent's context.
  const loaded = loadedLawIds(projectPath);
  const declared = manifest.laws.map((l) => l.id);
  const missing = declared.filter((id) => !loaded.has(id));
  checks.push({
    name: "law context coverage",
    ok: true,
    detail:
      `${declared.length - missing.length} of ${declared.length} laws loaded into context` +
      (missing.length ? ` — not yet loaded: ${missing.join(", ")}` : "") +
      ". Note: after a compact, root CLAUDE.md is re-injected but `paths:`-scoped rules are not," +
      " until a matching file is next touched — so a path-scoped law can be out of context" +
      " exactly when it matters, which is why it is also a hook.",
  });

  // Agent asymmetry — where blocking laws cannot be enforced at the keystroke.
  const configured = detectConfiguredAgents(projectPath);
  const unhooked = configured
    .map((id) => agentById(id))
    .filter((a) => a && !a.hooks)
    .map((a) => a!.label);
  if (unhooked.length) {
    const blocking = manifest.laws.filter((l) => l.enforcement === "bloqueo").length;
    checks.push({
      name: "hook coverage across agents",
      ok: true,
      detail:
        `no hook support for ${unhooked.join(", ")} — your ${blocking} blocking law(s) apply ` +
        "there only via `speclaw verify`.",
    });
  }
}
