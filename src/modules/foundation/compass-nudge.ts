import fs from "node:fs";
import path from "node:path";
import {
  NUDGE_ENTRY,
  isEvidenceTool,
  readCompassCalls,
  recordCompassCall,
} from "../../shared/compass-calls.js";
// Pure extension → language table: loads no grammar and opens no index DB.
import { langForPath } from "../compass/languages.js";
import { readIndexStats } from "../../shared/index-stats.js";

// Covers: req~compass-nudge~1
//
// The Compass-first nudge: on `PostToolUse` for Read/Grep/Glob of indexed code,
// remind the agent to locate and read through Compass when the call log shows
// no recent Compass evidence. Advisory context only — it never gates and never
// touches the verdict. It reads only the bounded call-log tail and the
// in-memory extension table, so it stays inside the hook latency budget.

/** Tools whose completed calls the nudge watches. */
export const NUDGE_TOOLS: ReadonlySet<string> = new Set(["Read", "Grep", "Glob", "Bash"]);

/** Shell commands that print a file's contents: a Bash `Read`. */
const SHELL_READERS = new Set(["cat", "head", "tail", "sed", "less", "more", "nl", "bat", "awk"]);

/** Shell commands that search contents: a Bash `Grep`. */
const SHELL_SEARCHERS = new Set(["grep", "egrep", "rg", "ag", "ack", "git-grep"]);

/**
 * The code read a Bash command performs, as the Read/Grep call it stands in
 * for, or null when it reads no indexed code. A reader counts only with an
 * existing indexed file argument (so `cat > f <<EOF` writes stay silent); a
 * searcher counts on an indexed file, a directory, or the whole repo.
 */
export function bashCodeRead(
  projectPath: string,
  command: string,
): { tool: "Read" | "Grep"; raw: string; pattern?: string } | null {
  // Split on command separators first, then pipes: a command after `|` reads
  // the previous command's output, not a file (`npm test | grep fail`).
  const commands = command.split(/\|\||&&|;|\n/).map((c) => c.split("|")[0] ?? "");
  for (const segment of commands) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    let verb = words[0] ? path.basename(words[0]) : "";
    let rest = words.slice(1);
    if (verb === "git" && rest[0] === "grep") {
      verb = "git-grep";
      rest = rest.slice(1);
    }
    const reader = SHELL_READERS.has(verb);
    if (!reader && !SHELL_SEARCHERS.has(verb)) continue;
    // A redirect or heredoc writes; `sed -i` edits in place.
    if (reader && rest.some((w) => w.startsWith(">") || w.startsWith("<<"))) continue;
    if (verb === "sed" && rest.some((w) => /^-[a-zA-Z]*i/.test(w))) continue;
    const args = rest.filter((w) => !w.startsWith("-")).map((w) => w.replace(/^['"]|['"]$/g, ""));
    const existing = args.filter((a) => {
      const target = resolveTarget(projectPath, a);
      return target !== null && target !== ROOT && isDirectory(projectPath, target) !== undefined;
    });
    if (reader) {
      const file = existing.find((a) => indexedExt(path.extname(a) || "."));
      if (file) return { tool: "Read", raw: file };
      continue;
    }
    const where = existing.find(
      (a) => isDirectory(projectPath, a) === true || indexedExt(path.extname(a) || "."),
    );
    // No path argument: a search of the working directory, i.e. the repo.
    if (where || existing.length === 0)
      return { tool: "Grep", raw: where ?? ".", pattern: args[0] };
  }
  return null;
}

/**
 * Below this many indexed files, reading a file costs less than a graph query
 * (measured: in a 2-file repo a nudged agent spent an extra turn on Compass and
 * still read the file), so the nudge stays silent.
 */
export const NUDGE_MIN_INDEXED_FILES = 40;

/** No nudge when a Compass evidence call landed within this window. */
export const NUDGE_EVIDENCE_WINDOW_MS = 10 * 60 * 1000;

/** At most one nudge per this window. */
export const NUDGE_RATE_LIMIT_MS = 5 * 60 * 1000;

/** Path segments that are never indexed source. */
const SKIP_SEGMENTS = new Set(["node_modules", ".git", ".speclaw", "dist"]);

/**
 * True for a `PostToolUse` Read/Grep/Glob call. Those calls are the nudge's
 * alone: laws govern mutations, so `checkAction` skips law evaluation for them.
 */
export function isNudgeEvent(args: NudgeInput): boolean {
  if (args.event !== "PostToolUse") return false;
  const tool = usable(args.toolName) ?? usable(args.payload?.tool_name);
  return !!tool && NUDGE_TOOLS.has(tool);
}

/** Inputs the nudge reads from a check call. */
export interface NudgeInput {
  projectPath: string;
  event: string;
  toolName?: string;
  payload: Record<string, unknown>;
}

/** A usable string: non-empty and not an unsubstituted `${…}` hook placeholder. */
function usable(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && !s.includes("${") ? s : null;
}

/** Sentinel target for a repo-wide search: no path, or the project root. */
const ROOT = "";

/**
 * The project-relative POSIX target, {@link ROOT} for the project root, or
 * null when the nudge has nothing to say about it: outside the project, or
 * under a never-indexed directory.
 */
function resolveTarget(projectPath: string, raw: string): string | null {
  const root = path.resolve(projectPath);
  const rel = path.relative(root, path.resolve(root, raw));
  if (!rel) return ROOT;
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  const segments = rel.split(path.sep);
  if (segments.some((seg) => SKIP_SEGMENTS.has(seg))) return null;
  return segments.join("/");
}

/** ripgrep `--type` names whose extension differs from the name. */
const RG_TYPE_EXT: Readonly<Record<string, string>> = {
  rust: "rs",
  python: "py",
  typescript: "ts",
  javascript: "js",
  ruby: "rb",
  csharp: "cs",
  kotlin: "kt",
  markdown: "md",
  golang: "go",
};

/** True when `ext` (with or without the dot) is a Compass-indexed extension. */
function indexedExt(ext: string): boolean {
  return langForPath(`x.${ext.replace(/^\./, "")}`) !== undefined;
}

/**
 * The extensions a glob restricts matches to, expanding `*.{ts,md}` braces;
 * an empty list when the last segment names no extension (e.g. `**\/*`).
 */
function globExtensions(glob: string): string[] {
  const last = glob.split("/").pop() ?? glob;
  const brace = /\.\{([^}]*)\}$/.exec(last);
  if (brace)
    return brace[1]!
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  const ext = path.extname(last);
  return ext && !/[*?[]/.test(ext) ? [ext.slice(1)] : [];
}

/** A glob is code-targeting when it is extension-less or names an indexed extension. */
function globTargetsCode(glob: string): boolean {
  const exts = globExtensions(glob);
  return exts.length === 0 || exts.some(indexedExt);
}

/** Grep is restricted to non-indexed files when its `glob` or `type` says so. */
function grepRestrictedAway(input: Record<string, unknown>): boolean {
  const glob = usable(input.glob);
  if (glob && !globTargetsCode(glob)) return true;
  const type = usable(input.type);
  if (type && !indexedExt(RG_TYPE_EXT[type] ?? type)) return true;
  return false;
}

/**
 * Whether a Read/Grep/Glob of `target` is code access the nudge cares about.
 *
 * - Read: the file has an indexed extension.
 * - Grep: an indexed file, a directory, or a repo-wide search ({@link ROOT}),
 *   unless `glob`/`type` restrict it to non-indexed extensions.
 * - Glob: an indexed file, a directory, or a repo-wide search, when `pattern`
 *   names an indexed extension or none at all (e.g. `**\/*`); a directory with
 *   no pattern stays eligible.
 */
function eligible(
  projectPath: string,
  tool: string,
  target: string,
  input: Record<string, unknown>,
): boolean {
  if (target === ROOT) return tool !== "Read" && searchEligible(tool, "", input);
  const dir = isDirectory(projectPath, target);
  if (tool === "Read") return dir !== true && indexedExt(path.extname(target) || ".");
  // A directory has no extension, even when its name has a dot (`src/v1.2`).
  const ext = dir === true ? "" : path.extname(target);
  return searchEligible(tool, ext, input, target);
}

/**
 * Whether the target is a directory: one cheap `statSync`, no index access.
 * Undefined when it cannot be stat'ed (missing, permissions) — callers then
 * fall back to the extension heuristic.
 */
function isDirectory(projectPath: string, target: string): boolean | undefined {
  try {
    return fs.statSync(path.join(projectPath, target)).isDirectory();
  } catch {
    return undefined;
  }
}

/** Grep/Glob eligibility once the target's extension (`""` for a directory) is known. */
function searchEligible(
  tool: string,
  ext: string,
  input: Record<string, unknown>,
  target: string = ROOT,
): boolean {
  if (ext && !indexedExt(ext)) return false;
  if (tool === "Grep") return !grepRestrictedAway(input);
  const pattern = usable(input.pattern);
  if (!pattern) return target !== ROOT;
  return globTargetsCode(pattern);
}

/**
 * Evaluate the Compass-first nudge for one check call.
 *
 * Returns the nudge text — after recording a `nudge` entry in the call log for
 * the rate limit — or null when the event is not an eligible `PostToolUse`
 * Read/Grep/Glob, a Compass evidence call landed in the last 10 minutes, or a
 * nudge already fired in the last 5 minutes. Never throws.
 *
 * @param args - The check call's project, event, tool, and raw payload.
 * @param now - Current epoch ms (injectable for tests).
 */
export function compassNudge(args: NudgeInput, now: number = Date.now()): string | null {
  try {
    if (args.event !== "PostToolUse") return null;
    const payload = args.payload ?? {};
    let tool = usable(args.toolName) ?? usable(payload.tool_name);
    if (!tool || !NUDGE_TOOLS.has(tool)) return null;
    const indexed = readIndexStats(args.projectPath);
    if (indexed && indexed.files < NUDGE_MIN_INDEXED_FILES) return null;

    let input = (payload.tool_input ?? payload.toolInput ?? payload) as Record<string, unknown>;
    if (tool === "Bash") {
      const command = usable(input.command);
      const read = command ? bashCodeRead(args.projectPath, command) : null;
      if (!read) return null;
      tool = read.tool;
      input = { path: read.raw, ...(read.pattern ? { pattern: read.pattern } : {}) };
    }
    // No path on Grep/Glob means the cwd: a repo-wide search.
    const raw = usable(input.file_path) ?? usable(input.path) ?? ".";
    const target = resolveTarget(args.projectPath, raw);
    if (target === null || !eligible(args.projectPath, tool, target, input)) return null;
    const pattern = usable(input.pattern);

    const recent = readCompassCalls(args.projectPath, { sinceMs: now - NUDGE_EVIDENCE_WINDOW_MS });
    if (recent.some((c) => isEvidenceTool(c.tool))) return null;
    const rateFloor = now - NUDGE_RATE_LIMIT_MS;
    if (recent.some((c) => c.tool === NUDGE_ENTRY && Date.parse(c.at) >= rateFloor)) return null;

    recordCompassCall(args.projectPath, NUDGE_ENTRY, new Date(now));
    const stem = target === ROOT ? "" : path.basename(target, path.extname(target));
    const query = tool === "Grep" && pattern ? pattern : stem || pattern || "<concept>";
    const symbol = stem || (tool === "Grep" && pattern ? pattern : "<symbol>");
    return (
      `Compass first: no compass_find / compass_explore call in the last 10 min. ` +
      `Try \`compass_explore ${symbol}\` or \`compass_find "${query}"\` before reading code.`
    );
  } catch {
    return null;
  }
}
