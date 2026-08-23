/** Canonical MCP tools counted toward the surface limit (aliases excluded). */
export const CANONICAL_TOOLS = [
  "compass_explore",
  "compass_find",
  "compass_diff_context",
  "compass_index",
  "lawbook_change",
  "lawbook_investigate",
  "speclaw_setup",
  "speclaw_check",
] as const;

export type CanonicalTool = (typeof CANONICAL_TOOLS)[number];

export const MAX_CANONICAL_TOOLS = 8;

/** Retired MCP names → canonical replacement hint for deprecation notices. */
export const ALIAS_TARGETS: Record<string, string> = {
  compass_search: "compass_find (mode: exact)",
  compass_recall: "compass_find (mode: concept)",
  compass_impact: 'compass_explore (include: ["blast_radius"])',
  compass_trace: "compass_explore (to: <symbol>)",
  compass_affected_tests: "compass_explore or compass_diff_context",
  compass_hotspots: "compass_explore or compass_diff_context",
  compass_coupling: "compass_diff_context",
  compass_watch: "compass_index (action: start|stop|status)",
  lawbook_init: 'lawbook_change (action: "init")',
  lawbook_list: 'lawbook_change (action: "list")',
  lawbook_validate: 'lawbook_change (action: "validate")',
  lawbook_sync: 'lawbook_change (action: "sync")',
  lawbook_archive: 'lawbook_change (action: "archive")',
  lawbook_level: 'lawbook_change (action: "level")',
  lawbook_coverage: 'lawbook_change (action: "coverage")',
  lawbook_drift: 'lawbook_change (action: "drift")',
  init_project: 'speclaw_setup (action: "init")',
  configure_agent: 'speclaw_setup (action: "configure-agent")',
  add_pack: 'speclaw_setup (action: "add-pack")',
  list_packs: 'speclaw_setup (action: "list-packs")',
};

export const ALIAS_NAMES = Object.keys(ALIAS_TARGETS);

const ALIAS_SET = new Set(ALIAS_NAMES);

/** True when `name` is one of the eight canonical tools. */
export function isCanonicalTool(name: string): name is CanonicalTool {
  return (CANONICAL_TOOLS as readonly string[]).includes(name);
}

/** True when `name` is a deprecated alias (not counted in the canonical limit). */
export function isAliasTool(name: string): boolean {
  return ALIAS_SET.has(name);
}

/** Whether deprecated aliases should register for this process. */
export function aliasesEnabled(): boolean {
  return process.env.SPECLAW_NO_ALIASES !== "1";
}
