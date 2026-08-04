// Which scaffolded files speclaw owns vs the user owns. `speclaw update` uses
// this split to decide what it may overwrite automatically (managed) and what it
// must leave to the user's agent via a prompt (personalized).

/**
 * Project-relative trees that hold speclaw's workflow machinery. The user is not
 * meant to edit these, so `speclaw update` overwrites them with the current
 * version (backing up any local edits to `<file>.bak` first).
 */
export const MANAGED_TREES: readonly string[] = [
  "ai-specs/skills",
  "ai-specs/commands",
  "ai-specs/rules",
  "ai-specs/agents",
];

/**
 * Files filled with project specifics at init. `speclaw update` never rewrites
 * these; when a release changes their speclaw-authored content, update emits an
 * agent prompt to apply the change while preserving the user's content.
 */
export const PERSONALIZED: readonly string[] = [
  "CLAUDE.md",
  "AGENTS.md",
  "LAWS.md",
  "docs/standards",
  "docs/compass.md",
  "lawbook/config.yaml",
];

/** True if a project-relative path sits under a managed tree. */
export function isManaged(relPath: string): boolean {
  const norm = relPath.split("\\").join("/");
  return MANAGED_TREES.some((t) => norm === t || norm.startsWith(t + "/"));
}
