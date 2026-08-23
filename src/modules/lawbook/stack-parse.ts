import path from "node:path";

/** One frame extracted from a stack trace. */
export interface ParsedFrame {
  /** Function name when present; empty for anonymous frames. */
  fn: string;
  /** Normalized project-relative path when resolved. */
  file: string;
  line: number;
  /** Raw path string from the trace before normalization. */
  rawPath: string;
}

export type UnresolvedReason = "not-indexed" | "unparseable" | "external";

export interface UnresolvedFrame {
  raw: string;
  reason: UnresolvedReason;
}

export interface ParseStackResult {
  /** Own-project frames, deepest-first (V8 order). */
  frames: ParsedFrame[];
  unresolved: UnresolvedFrame[];
  /** True when input looks like Python (File "...", line N). */
  format: "v8" | "python" | "unknown";
}

const V8_NAMED = /^\s*at\s+(?:async\s+)?(?:(.+?)\s+\()?([^\s()]+):(\d+):(\d+)\)?\s*$/;
const V8_ANON = /^\s*at\s+([^\s()]+):(\d+):(\d+)\s*$/;
const PY_FRAME = /^\s*File\s+"([^"]+)",\s*line\s+(\d+)(?:,\s*in\s+(.+))?\s*$/;

function isExternal(rawPath: string): boolean {
  const n = rawPath.replace(/\\/g, "/");
  return (
    n.includes("node_modules/") ||
    n.includes("node:internal") ||
    n.startsWith("node:") ||
    n.includes("/lib/python") ||
    n.includes("site-packages/")
  );
}

/**
 * Map `dist/foo.js` → `src/foo.ts` when the basename matches (no silent guess
 * beyond that convention).
 */
export function mapDistToSrc(rel: string): string {
  const n = rel.replace(/\\/g, "/");
  if (!n.startsWith("dist/")) return n;
  const base = path.basename(n, path.extname(n));
  return `src/${base}.ts`;
}

/**
 * Normalize an absolute or relative trace path to a project-relative path.
 *
 * @param projectPath - Project root used to strip prefixes.
 * @param rawPath - Path as it appears in the trace.
 */
export function normalizeTracePath(projectPath: string, rawPath: string): string {
  let p = rawPath.replace(/\\/g, "/");
  const root = projectPath.replace(/\\/g, "/");
  if (p.startsWith(root + "/")) p = p.slice(root.length + 1);
  if (p.startsWith("file://")) {
    try {
      p = decodeURIComponent(new URL(p).pathname);
      if (p.startsWith(root + "/")) p = p.slice(root.length + 1);
    } catch {
      /* keep raw */
    }
  }
  p = p.replace(/^\.\//, "");
  p = mapDistToSrc(p);
  return p;
}

function parseV8Line(line: string, projectPath: string): ParsedFrame | UnresolvedFrame | null {
  const named = V8_NAMED.exec(line);
  if (named) {
    const rawPath = named[2]!;
    if (isExternal(rawPath)) return { raw: line.trim(), reason: "external" };
    const fn = named[1]?.trim() ?? "";
    const file = normalizeTracePath(projectPath, rawPath);
    return { fn, file, line: Number(named[3]), rawPath };
  }
  const anon = V8_ANON.exec(line);
  if (anon) {
    const rawPath = anon[1]!;
    if (isExternal(rawPath)) return { raw: line.trim(), reason: "external" };
    return {
      fn: "",
      file: normalizeTracePath(projectPath, rawPath),
      line: Number(anon[2]),
      rawPath,
    };
  }
  return null;
}

function parsePythonLines(lines: string[], projectPath: string): ParseStackResult {
  const pyFrames: ParsedFrame[] = [];
  const unresolved: UnresolvedFrame[] = [];
  for (const line of lines) {
    const m = PY_FRAME.exec(line);
    if (!m) continue;
    const rawPath = m[1]!;
    if (isExternal(rawPath)) {
      unresolved.push({ raw: line.trim(), reason: "external" });
      continue;
    }
    pyFrames.push({
      fn: m[3]?.trim() ?? "",
      file: normalizeTracePath(projectPath, rawPath),
      line: Number(m[2]),
      rawPath,
    });
  }
  // Python traces list shallow→deep; invert to deepest-first like V8.
  pyFrames.reverse();
  return { frames: pyFrames, unresolved, format: "python" };
}

/**
 * Parse a V8 (Node) or Python stack trace into own-project frames.
 *
 * @param projectPath - Project root for path normalization.
 * @param stackTrace - Raw stack trace text.
 */
export function parseStackTrace(projectPath: string, stackTrace: string): ParseStackResult {
  const lines = stackTrace.split("\n");
  const pyProbe = lines.some((l) => PY_FRAME.test(l));
  if (pyProbe) return parsePythonLines(lines, projectPath);

  const frames: ParsedFrame[] = [];
  const unresolved: UnresolvedFrame[] = [];
  let sawV8 = false;
  for (const line of lines) {
    const parsed = parseV8Line(line, projectPath);
    if (!parsed) continue;
    sawV8 = true;
    if ("reason" in parsed) unresolved.push(parsed);
    else frames.push(parsed);
  }

  if (!sawV8 && stackTrace.trim()) {
    for (const line of lines) {
      if (line.trim()) unresolved.push({ raw: line.trim(), reason: "unparseable" });
    }
    return { frames: [], unresolved, format: "unknown" };
  }

  return { frames, unresolved, format: "v8" };
}

/** Extract a simple method name from `Class.method` frames. */
export function frameSymbolName(frame: ParsedFrame): string {
  if (!frame.fn) return "";
  const dot = frame.fn.lastIndexOf(".");
  return dot >= 0 ? frame.fn.slice(dot + 1) : frame.fn;
}
