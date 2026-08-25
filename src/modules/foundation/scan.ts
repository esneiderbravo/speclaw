/**
 * Prompt-injection scanners for rule / skill files.
 * Complements digests: hashes catch any edit; scanners catch known payloads.
 */
// Covers: req~injection-scan~1
import fs from "node:fs";
import path from "node:path";

export type ScanSeverity = "error" | "warn" | "info";

export interface ScanFinding {
  detector: string;
  severity: ScanSeverity;
  path: string;
  line: number;
  excerpt: string;
  message: string;
}

export interface ScanSuppression {
  detector: string;
  path: string;
  note: string;
}

const OVERRIDE =
  /\b(ignore\s+previous\s+instructions|disregard\s+the\s+above|you\s+are\s+now|new\s+system\s+prompt|ignora\s+las\s+instrucciones\s+anteriores)\b/i;

const SHELL =
  /\b(curl\s+[^\n|]*\|\s*(ba)?sh|bash\s+-c|Invoke-Expression|iex\b|eval\s*\(|npm\s+run\s+[^\s]+.*\|\s*sh)\b/i;

const EXFIL =
  /\b(send\s+(this|the)\s+(repo|code|contents?)\s+to|exfiltrat|upload\s+to\s+https?:\/\/|read\s+(\.env|~\/\.ssh|~\/\.aws|\.npmrc)|exfiltra)\b/i;

const URL_RE = /https?:\/\/[^\s)>\]]+/gi;

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u202A-\u202E]/;

const IMPERATIVE_HTML =
  /<!--[\s\S]{0,200}\b(run|execute|ignore|disregard|curl|bash|send)\b[\s\S]{0,200}-->/i;

/**
 * Normalize text before detection (NFKC, strip zero-width/bidi, fold common
 * Cyrillic lookalikes, collapse whitespace).
 */
export function normalizeForScan(text: string): string {
  let t = text.normalize("NFKC");
  t = t.replace(ZERO_WIDTH, "");
  t = t.replace(/[\u0400-\u04FF]/g, (ch) => CYRILLIC_FOLD[ch] ?? ch);
  t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  t = t.replace(/\\\*|\\_|\\`/g, (m) => m.slice(1));
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

const CYRILLIC_FOLD: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  А: "A",
  Е: "E",
  О: "O",
  Р: "P",
  С: "C",
  У: "Y",
  Х: "X",
};

/** Scan one file's raw contents; returns findings with original line numbers. */
export function scanText(
  relPath: string,
  raw: string,
  opts: { suppressions?: ScanSuppression[]; allowHosts?: string[] } = {},
): ScanFinding[] {
  const suppressions = opts.suppressions ?? [];
  const allow = new Set((opts.allowHosts ?? []).map((h) => h.toLowerCase()));
  const out: ScanFinding[] = [];
  const lines = raw.split(/\r?\n/);

  const push = (f: ScanFinding) => {
    if (
      suppressions.some(
        (s) => s.detector === f.detector && matchPath(s.path, f.path) && s.note.trim().length > 0,
      )
    ) {
      return;
    }
    out.push(f);
  };

  if (ZERO_WIDTH.test(raw)) {
    push({
      detector: "injection/hidden-text",
      severity: "error",
      path: relPath,
      line: 1,
      excerpt: "zero-width or bidi control characters",
      message: "Hidden / bidi control characters in a rule file.",
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const norm = normalizeForScan(line);
    const ln = i + 1;

    if (OVERRIDE.test(norm) || OVERRIDE.test(line)) {
      push({
        detector: "injection/instruction-override",
        severity: "error",
        path: relPath,
        line: ln,
        excerpt: clip(line),
        message: "Instruction-override phrasing in a rule file.",
      });
    }
    if (SHELL.test(norm) || SHELL.test(line)) {
      push({
        detector: "injection/shell-execution",
        severity: "error",
        path: relPath,
        line: ln,
        excerpt: clip(line),
        message: "Shell-execution instruction in a rule file.",
      });
    }
    if (EXFIL.test(norm) || EXFIL.test(line)) {
      push({
        detector: "injection/exfiltration",
        severity: "error",
        path: relPath,
        line: ln,
        excerpt: clip(line),
        message: "Possible exfiltration instruction in a rule file.",
      });
    }
    for (const m of line.matchAll(URL_RE)) {
      try {
        const host = new URL(m[0]!).hostname.toLowerCase();
        if (allow.size > 0 && !allow.has(host) && !host.endsWith(".github.com")) {
          push({
            detector: "injection/unallowlisted-url",
            severity: "warn",
            path: relPath,
            line: ln,
            excerpt: clip(m[0]!),
            message: `URL host not on allowlist: ${host}`,
          });
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (IMPERATIVE_HTML.test(raw)) {
    const idx = raw.search(IMPERATIVE_HTML);
    const snippet = raw.slice(Math.max(0, idx), idx + 220);
    // Data-only speclaw markers (map/laws/provenance) are not agent instructions.
    if (!/<!--\s*speclaw:/.test(snippet)) {
      const line = lineOf(raw, idx);
      push({
        detector: "injection/imperative-html-comment",
        severity: "warn",
        path: relPath,
        line,
        excerpt: clip(raw.slice(idx, idx + 120)),
        message: "HTML comment contains imperative language (visible to some agents).",
      });
    }
  }

  // External @import / @~/ / @C:\…
  // External @import / @~/ / @C:\…
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m =
      /@([~/][^\s)\]>"']+)/.exec(line) ??
      /@([A-Za-z]:[^\s)\]>"']+)/.exec(line) ??
      /@import\s+["']([^"']+)["']/.exec(line);
    if (!m) continue;
    const target = m[1]!;
    push({
      detector: "injection/external-import",
      severity: "warn",
      path: relPath,
      line: i + 1,
      excerpt: clip(line),
      message: `Import may resolve outside the working directory: ${target}`,
    });
  }

  // Frontmatter ↔ body mismatch (skills)
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (fm) {
    const front = fm[1]!;
    const body = fm[2]!;
    const frontDesc = /(?:^|\n)description:\s*["']?([^\n"']+)/i.exec(front)?.[1] ?? "";
    if (frontDesc && SHELL.test(body) && !SHELL.test(frontDesc)) {
      push({
        detector: "injection/manifest-prose-mismatch",
        severity: "warn",
        path: relPath,
        line: 1,
        excerpt: clip(frontDesc),
        message: "Skill frontmatter description and body disagree on shell risk.",
      });
    }
  }

  return out;
}

function matchPath(pattern: string, file: string): boolean {
  if (pattern === file) return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return file === prefix || file.startsWith(prefix + "/");
  }
  if (pattern.includes("*")) {
    const re = new RegExp("^" + pattern.split("*").map(escapeRegExp).join(".*") + "$");
    return re.test(file);
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clip(s: string, n = 120): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function lineOf(text: string, index: number): number {
  if (index <= 0) return 1;
  return text.slice(0, index).split(/\r?\n/).length;
}

/** Load optional scan suppressions from lawbook/config.yaml (line-oriented). */
export function loadScanSuppressions(projectPath: string): ScanSuppression[] {
  const cfgPath = path.join(projectPath, "lawbook", "config.yaml");
  if (!fs.existsSync(cfgPath)) return [];
  const text = fs.readFileSync(cfgPath, "utf8");
  // Very small subset: repeated blocks under scanSuppressions are not fully
  // parsed; support a flat JSON-ish list in a comment-free line for v1:
  // scanSuppressions: [{"detector":"…","path":"…","note":"…"}]
  const m = /^\s*scanSuppressions\s*:\s*(\[[\s\S]*?\])\s*$/m.exec(text);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]!) as ScanSuppression[];
    return arr.filter((s) => s.detector && s.path && s.note);
  } catch {
    return [];
  }
}

/** Scan a list of project-relative files that exist. */
export function scanPaths(
  projectPath: string,
  relPaths: string[],
  opts: { suppressions?: ScanSuppression[]; allowHosts?: string[] } = {},
): ScanFinding[] {
  const out: ScanFinding[] = [];
  for (const rel of relPaths) {
    const abs = path.join(projectPath, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    out.push(...scanText(rel, fs.readFileSync(abs, "utf8"), opts));
  }
  return out;
}
