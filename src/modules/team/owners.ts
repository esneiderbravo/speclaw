import fs from "node:fs";
import path from "node:path";

/**
 * Spec ownership: compile `team.owners` from `lawbook/config.yaml` into a
 * managed block at the **end** of `.github/CODEOWNERS` (GitHub: last match wins).
 *
 * Markers are the merge identity — user content outside them is preserved.
 * No MCP surface; humans run `speclaw owners --write`.
 */

export const OWNERS_START = "# >>> speclaw:owners";
export const OWNERS_END = "# <<< speclaw:owners";

const START_LINE_RE = /^#\s*>>>\s*speclaw:owners\b.*$/m;
const END_LINE_RE = /^#\s*<<<\s*speclaw:owners\s*$/m;

/** `@user`, `@org/team`, or a simple email. */
const OWNER_TOKEN_RE =
  /^(?:@[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}(?:\/[a-zA-Z0-9._-]+)?|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

/** Declared capability → owner tokens, plus the derive knob (always ignored when false). */
export interface TeamOwnersConfig {
  owners: Record<string, string[]>;
  deriveFromTraceability: boolean;
}

export interface WriteOwnersResult {
  written: boolean;
  path: string;
  reason?: string;
  capabilities: number;
}

export interface CheckOwnersResult {
  ok: boolean;
  path: string;
  detail: string;
  expected?: string;
  actual?: string;
}

export interface OwnersDoctorCheck {
  id: string;
  title: string;
  status: "ok" | "warn" | "error" | "skip";
  detail: string;
  remedy?: string;
}

/**
 * True when `token` is a GitHub-style `@user`, `@org/team`, or a simple email.
 *
 * @param token - Owner token from config (trimmed).
 */
// Covers: req~owners-syntax~1
export function isValidOwnerToken(token: string): boolean {
  return OWNER_TOKEN_RE.test(token.trim());
}

/**
 * Collect owner tokens that fail {@link isValidOwnerToken}.
 *
 * @param owners - Capability → tokens map.
 */
export function invalidOwnerTokens(owners: Record<string, string[]>): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const tokens of Object.values(owners)) {
    for (const t of tokens) {
      const tok = t.trim();
      if (!tok || seen.has(tok)) continue;
      seen.add(tok);
      if (!isValidOwnerToken(tok)) bad.push(tok);
    }
  }
  return bad;
}

/**
 * Load `team.owners` from `lawbook/config.yaml` with a line-oriented subset
 * parser (no YAML dependency). Returns `null` when the key is absent.
 *
 * @param projectPath - Project root.
 */
// Covers: req~owners-absent~1, req~owners-no-derive~1
export function loadTeamOwners(projectPath: string): TeamOwnersConfig | null {
  const cfgPath = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfgPath)) return null;
  const text = fs.readFileSync(cfgPath, "utf8");
  return parseTeamOwnersYaml(text);
}

/**
 * Parse the `team.owners` map from a config.yaml body.
 *
 * Supports inline lists (`cap: ["@a", "@b"]`) and simple dashed lists under a
 * key. `"*"` may be written as `"*":`, `'*':`, or `*:`.
 *
 * @param text - Full config.yaml contents.
 */
export function parseTeamOwnersYaml(text: string): TeamOwnersConfig | null {
  const lines = text.split(/\r?\n/);
  let inTeam = false;
  let inOwners = false;
  let teamIndent = 0;
  let ownersIndent = 0;
  const owners: Record<string, string[]> = {};
  let deriveFromTraceability = false;
  let currentKey: string | null = null;
  let currentIndent = 0;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const indent = line.match(/^ */)?.[0]?.length ?? 0;
    const trimmed = line.trim();

    if (!inTeam) {
      if (/^team\s*:/.test(trimmed)) {
        inTeam = true;
        teamIndent = indent;
      }
      continue;
    }

    if (indent <= teamIndent && !/^team\s*:/.test(trimmed)) {
      break;
    }

    if (!inOwners) {
      if (/^owners\s*:/.test(trimmed)) {
        inOwners = true;
        ownersIndent = indent;
        continue;
      }
      if (/^deriveFromTraceability\s*:\s*(true|false)\s*$/i.test(trimmed)) {
        deriveFromTraceability = /true/i.test(trimmed);
      }
      continue;
    }

    if (indent <= ownersIndent && !/^owners\s*:/.test(trimmed)) {
      // Still inside team — another sibling key
      if (indent > teamIndent) {
        inOwners = false;
        currentKey = null;
        if (/^deriveFromTraceability\s*:\s*(true|false)\s*$/i.test(trimmed)) {
          deriveFromTraceability = /true/i.test(trimmed);
        }
        continue;
      }
      break;
    }

    // Dashed list item under current key
    if (currentKey && indent > currentIndent && trimmed.startsWith("- ")) {
      const tok = stripQuotes(trimmed.slice(2).trim());
      if (tok) owners[currentKey]!.push(tok);
      continue;
    }

    const inline = /^([^:]+):\s*(.*)$/.exec(trimmed);
    if (!inline) continue;
    const keyRaw = inline[1]!.trim();
    const rest = inline[2]!.trim();
    if (keyRaw === "owners" || keyRaw === "deriveFromTraceability") continue;
    const key = normalizeOwnerKey(keyRaw);
    currentKey = key;
    currentIndent = indent;
    if (!owners[key]) owners[key] = [];

    if (rest.startsWith("[")) {
      const inside = rest.replace(/^\[/, "").replace(/\]\s*$/, "");
      for (const part of inside.split(",")) {
        const tok = stripQuotes(part.trim());
        if (tok) owners[key]!.push(tok);
      }
    } else if (rest && !rest.startsWith("#")) {
      const tok = stripQuotes(rest);
      if (tok) owners[key]!.push(tok);
    }
  }

  if (Object.keys(owners).length === 0) return null;
  // Drop empty capability lists — write will reject them if any remain empty after filter
  for (const [k, v] of Object.entries(owners)) {
    if (v.length === 0) delete owners[k];
  }
  if (Object.keys(owners).length === 0) return null;
  return { owners, deriveFromTraceability };
}

function normalizeOwnerKey(raw: string): string {
  const q = stripQuotes(raw);
  return q === "*" ? "*" : q;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Render the marked CODEOWNERS block body (including start/end markers).
 * Does not emit derived `src/**` lines even when `deriveFromTraceability` is true
 * in this release — callers must pass `derive: false` for emission (v1).
 *
 * @param owners - Capability → tokens.
 * @param opts - When `derive` is true, still no src paths in v1 (contract).
 */
// Covers: req~owners-compile~1, req~owners-no-derive~1
export function renderOwnersBlock(
  owners: Record<string, string[]>,
  opts: { derive?: boolean } = {},
): string {
  void opts.derive; // reserved; v1 never emits derived paths
  const lines: string[] = [
    `${OWNERS_START} (generated — do not edit by hand; \`speclaw owners --write\`)`,
  ];
  const keys = Object.keys(owners).sort((a, b) => {
    if (a === "*") return 1;
    if (b === "*") return -1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const tokens = (owners[key] ?? []).map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) continue;
    const joined = tokens.join(" ");
    if (key === "*") {
      lines.push(`lawbook/config.yaml ${joined}`);
      lines.push(`docs/standards/ ${joined}`);
    } else {
      lines.push(`lawbook/specs/${key}/ ${joined}`);
      lines.push(`lawbook/changes/*/specs/${key}/ ${joined}`);
    }
  }
  lines.push(OWNERS_END);
  return lines.join("\n");
}

/**
 * Merge a full marked block into existing CODEOWNERS text, preserving content
 * outside markers and placing the speclaw block at the end.
 *
 * @param existing - Current file contents (may be empty).
 * @param block - Full marked block from {@link renderOwnersBlock}.
 */
// Covers: req~owners-merge~1
export function mergeOwnersBlock(existing: string, block: string): string {
  const stripped = stripOwnersBlock(existing).replace(/\s+$/, "");
  if (!stripped) return block.endsWith("\n") ? block : `${block}\n`;
  return `${stripped}\n\n${block.endsWith("\n") ? block : `${block}\n`}`;
}

/**
 * Remove any existing speclaw owners block from CODEOWNERS text.
 *
 * @param text - Full CODEOWNERS contents.
 */
export function stripOwnersBlock(text: string): string {
  const start = START_LINE_RE.exec(text);
  if (!start || start.index === undefined) return text;
  const afterStart = text.slice(start.index + start[0].length);
  const end = END_LINE_RE.exec(afterStart);
  if (!end || end.index === undefined) {
    // Orphan start — remove from start to EOF
    return text.slice(0, start.index).replace(/\s+$/, "");
  }
  const endAbs = start.index + start[0].length + end.index + end[0].length;
  const before = text.slice(0, start.index);
  const after = text.slice(endAbs);
  return (before + after).replace(/\s+$/, "");
}

/**
 * True when non-empty content appears after the end marker (last-match trap).
 *
 * @param text - Full CODEOWNERS contents.
 */
export function hasContentAfterOwnersBlock(text: string): boolean {
  const end = END_LINE_RE.exec(text);
  if (!end || end.index === undefined) return false;
  const after = text.slice(end.index + end[0].length);
  return after.trim().length > 0;
}

/**
 * Extract the marked block (including markers), or `null` if absent.
 *
 * @param text - Full CODEOWNERS contents.
 */
export function extractOwnersBlock(text: string): string | null {
  const start = START_LINE_RE.exec(text);
  if (!start || start.index === undefined) return null;
  const fromStart = text.slice(start.index);
  const end = END_LINE_RE.exec(fromStart);
  if (!end || end.index === undefined) return null;
  return fromStart.slice(0, end.index + end[0].length).trimEnd();
}

function codeownersPath(projectPath: string): string {
  return path.join(projectPath, ".github", "CODEOWNERS");
}

/**
 * Compile `team.owners` and write the managed block at the end of
 * `.github/CODEOWNERS`. No-op (success) when owners are undeclared.
 *
 * @param projectPath - Project root.
 * @throws When owner tokens fail local syntax or a capability list is empty.
 */
// Covers: req~owners-compile~1, req~owners-absent~1, req~owners-syntax~1
export function writeOwners(projectPath: string): WriteOwnersResult {
  const out = codeownersPath(projectPath);
  const cfg = loadTeamOwners(projectPath);
  if (!cfg) {
    return {
      written: false,
      path: out,
      reason: "no team.owners in lawbook/config.yaml",
      capabilities: 0,
    };
  }
  const bad = invalidOwnerTokens(cfg.owners);
  if (bad.length > 0) {
    throw new Error(`invalid owner token(s): ${bad.join(", ")}`);
  }
  for (const [k, v] of Object.entries(cfg.owners)) {
    if (v.length === 0) throw new Error(`team.owners.${k} has no owners`);
  }
  // v1: never derive from traceability even if the knob is true
  const block = renderOwnersBlock(cfg.owners, { derive: false });
  const existing = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  const next = mergeOwnersBlock(existing, block);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, next);
  return { written: true, path: out, capabilities: Object.keys(cfg.owners).length };
}

/**
 * Compare the on-disk speclaw owners block to what `team.owners` would emit.
 *
 * @param projectPath - Project root.
 */
export function checkOwners(projectPath: string): CheckOwnersResult {
  const out = codeownersPath(projectPath);
  const cfg = loadTeamOwners(projectPath);
  if (!cfg) {
    return {
      ok: true,
      path: out,
      detail: "no team.owners declared — nothing to check",
    };
  }
  const bad = invalidOwnerTokens(cfg.owners);
  if (bad.length > 0) {
    return {
      ok: false,
      path: out,
      detail: `invalid owner token(s): ${bad.join(", ")}`,
    };
  }
  const expected = renderOwnersBlock(cfg.owners, { derive: false });
  const existing = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (hasContentAfterOwnersBlock(existing)) {
    return {
      ok: false,
      path: out,
      detail: "content appears after # <<< speclaw:owners (last matching pattern wins)",
      expected,
      actual: extractOwnersBlock(existing) ?? "",
    };
  }
  const actual = extractOwnersBlock(existing);
  if (actual === null) {
    return {
      ok: false,
      path: out,
      detail: "speclaw owners block missing",
      expected,
      actual: "",
    };
  }
  if (normalizeBlock(actual) !== normalizeBlock(expected)) {
    return {
      ok: false,
      path: out,
      detail: "speclaw owners block does not match team.owners",
      expected,
      actual,
    };
  }
  return { ok: true, path: out, detail: "owners block matches team.owners" };
}

function normalizeBlock(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}

/**
 * Doctor checks for CODEOWNERS owners posture. Skips when `team.owners` is absent.
 *
 * @param projectPath - Project root.
 */
// Covers: req~doctor-owners~1
export function doctorOwnersChecks(projectPath: string): OwnersDoctorCheck[] {
  const cfg = loadTeamOwners(projectPath);
  if (!cfg) {
    return [
      {
        id: "cfg.owners",
        title: "spec owners",
        status: "skip",
        detail: "no team.owners in lawbook/config.yaml",
        remedy: "add team.owners then speclaw owners --write",
      },
    ];
  }

  const checks: OwnersDoctorCheck[] = [];
  const bad = invalidOwnerTokens(cfg.owners);
  if (bad.length > 0) {
    checks.push({
      id: "cfg.owners.syntax",
      title: "owner token syntax",
      status: "error",
      detail: `invalid token(s): ${bad.join(", ")}`,
      remedy: "fix team.owners (@user, @org/team, or email)",
    });
  } else {
    checks.push({
      id: "cfg.owners.syntax",
      title: "owner token syntax",
      status: "ok",
      detail: `${Object.keys(cfg.owners).length} capability key(s)`,
    });
  }

  const out = codeownersPath(projectPath);
  if (!fs.existsSync(out)) {
    checks.push({
      id: "cfg.owners.block",
      title: "CODEOWNERS owners block",
      status: "warn",
      detail: ".github/CODEOWNERS missing",
      remedy: "speclaw owners --write",
    });
    return checks;
  }

  const text = fs.readFileSync(out, "utf8");
  const block = extractOwnersBlock(text);
  if (!block) {
    checks.push({
      id: "cfg.owners.block",
      title: "CODEOWNERS owners block",
      status: "warn",
      detail: "speclaw owners block missing",
      remedy: "speclaw owners --write",
    });
    return checks;
  }

  if (hasContentAfterOwnersBlock(text)) {
    checks.push({
      id: "cfg.owners.block",
      title: "CODEOWNERS owners block",
      status: "error",
      detail: "content after # <<< speclaw:owners — last matching pattern wins in CODEOWNERS",
      remedy: "speclaw owners --write (reorders the managed block to the end)",
    });
  } else {
    checks.push({
      id: "cfg.owners.block",
      title: "CODEOWNERS owners block",
      status: "ok",
      detail: "managed block is last in .github/CODEOWNERS",
    });
  }

  checks.push({
    id: "cfg.owners.protection",
    title: "code owners review",
    status: "warn",
    detail: "CODEOWNERS is decorative unless branch protection requires review from Code Owners",
    remedy: "enable Require review from Code Owners on the default branch",
  });

  return checks;
}

/**
 * Refresh the owners block when declared; silent no-op when absent.
 * Used by init/update — never invents owners.
 *
 * @param projectPath - Project root.
 */
// Covers: req~owners-refresh-update~1
export function refreshOwnersIfConfigured(projectPath: string): WriteOwnersResult | null {
  const cfg = loadTeamOwners(projectPath);
  if (!cfg) return null;
  return writeOwners(projectPath);
}
