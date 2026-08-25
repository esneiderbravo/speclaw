import fs from "node:fs";
import path from "node:path";

/** Stable OFT-shaped identifier: type~name~revision. */
export interface SpecItemId {
  artifactType: string;
  name: string;
  revision: number;
}

/** A parsed requirement (or other) item from a lawbook spec. */
export interface SpecItem {
  id: SpecItemId | null;
  /** Full id string when present, e.g. `req~hook-generation~1`. */
  idText: string | null;
  title: string;
  status: string;
  needs: string[];
  tags: string[];
  depends: string[];
  covers: string[];
  /**
   * Optional verification keyword (`example` | `property` | `contract` | `manual`).
   * `property` expands effective coverage needs to include `ptest`; `Needs: ptest`
   * remains the source of truth when listed explicitly.
   */
  verification: string | null;
  /** Inline [@test|/[@impl] markers found under this item. */
  inlineLinks: InlineLink[];
  specPath: string;
  line: number;
}

/** An inline coverage marker embedded in a scenario (or other) heading. */
export interface InlineLink {
  kind: "test" | "impl";
  targetPath: string;
  line: number;
}

const RE_REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/;
const RE_ID = /`([a-z]{2,6})~([A-Za-z0-9._-]+)~(\d+)`/;
const RE_KEYWORD = /^(Status|Needs|Tags|Depends|Covers|Verification)\s*:\s*(.+?)\s*$/i;
const RE_INLINE = /\[@(test|impl)\s+([^\]]+)\]/gi;
const RE_ID_LOOSE = /\b([a-z]{2,6})~([A-Za-z0-9._-]+)~(\d+)\b/g;

/** Format a SpecItemId as `type~name~rev`. */
export function formatItemId(id: SpecItemId): string {
  return `${id.artifactType}~${id.name}~${id.revision}`;
}

/** Parse a single `type~name~rev` token, or null if malformed. */
export function parseItemId(text: string): SpecItemId | null {
  const m = /^([a-z]{2,6})~([A-Za-z0-9._-]+)~(\d+)$/.exec(text.trim());
  if (!m) return null;
  return { artifactType: m[1]!, name: m[2]!, revision: Number(m[3]) };
}

function splitList(value: string): string[] {
  return value
    .split(/[, ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIdList(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(RE_ID_LOOSE)) {
    out.push(`${m[1]}~${m[2]}~${m[3]}`);
  }
  return out;
}

/**
 * Parse one markdown spec file into requirement items. Headings without an
 * inline-code identifier are returned with `id: null` (ignored by coverage).
 *
 * @param specPath - Project-relative path of the spec (for reporting).
 * @param content - Full markdown source.
 */
export function parseSpecItems(specPath: string, content: string): SpecItem[] {
  const lines = content.split(/\r?\n/);
  const items: SpecItem[] = [];
  let current: SpecItem | null = null;

  const flush = () => {
    if (current) items.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const req = RE_REQUIREMENT.exec(line);
    if (req) {
      flush();
      const rest = req[1]!;
      const idMatch = RE_ID.exec(rest);
      let title = rest;
      let id: SpecItemId | null = null;
      let idText: string | null = null;
      if (idMatch) {
        id = {
          artifactType: idMatch[1]!,
          name: idMatch[2]!,
          revision: Number(idMatch[3]),
        };
        idText = formatItemId(id);
        title = rest.replace(idMatch[0], "").replace(/\s+/g, " ").trim();
        // Common forms: "Title `id`" or "`id` Title"
        title = title.replace(/^[\s—–-]+|[\s—–-]+$/g, "").trim();
      }
      current = {
        id,
        idText,
        title,
        status: "approved",
        needs: [],
        tags: [],
        depends: [],
        covers: [],
        verification: null,
        inlineLinks: [],
        specPath,
        line: i + 1,
      };
      continue;
    }

    if (!current) continue;

    // Next ### Requirement: or # heading ends the item body for keyword purposes,
    // but #### Scenario lines may still carry inline links.
    if (/^###?\s+/.test(line) && !/^####\s+/.test(line)) {
      flush();
      // Re-process this line as a potential new requirement on next iteration
      // by rewinding — simpler: only #### and body lines belong to current.
      i--;
      continue;
    }

    const kw = RE_KEYWORD.exec(line);
    if (kw) {
      const key = kw[1]!.toLowerCase();
      const value = kw[2]!;
      if (key === "status") current.status = value.trim().toLowerCase();
      else if (key === "needs") current.needs = splitList(value).map((s) => s.toLowerCase());
      else if (key === "tags") current.tags = splitList(value);
      else if (key === "depends") current.depends = parseIdList(value);
      else if (key === "covers") current.covers = parseIdList(value);
      else if (key === "verification") current.verification = value.trim().toLowerCase();
      continue;
    }

    for (const m of line.matchAll(RE_INLINE)) {
      current.inlineLinks.push({
        kind: m[1]!.toLowerCase() as "test" | "impl",
        targetPath: m[2]!.trim(),
        line: i + 1,
      });
    }
  }
  flush();
  return items;
}

/**
 * Walk `lawbook/specs/**\/spec.md` (and optionally a change's delta specs) and
 * parse every requirement item.
 *
 * @param projectPath - Absolute project root.
 * @param opts.change - When set, parse only that change's delta specs.
 */
export function loadSpecItems(projectPath: string, opts: { change?: string } = {}): SpecItem[] {
  const roots: string[] = [];
  if (opts.change) {
    roots.push(path.join(projectPath, "lawbook", "changes", opts.change, "specs"));
  } else {
    roots.push(path.join(projectPath, "lawbook", "specs"));
  }

  const items: SpecItem[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of walkSpecFiles(root)) {
      const rel = path.relative(projectPath, file).split(path.sep).join("/");
      const content = fs.readFileSync(file, "utf8");
      items.push(...parseSpecItems(rel, content));
    }
  }
  return items;
}

function* walkSpecFiles(dir: string): Generator<string> {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name === "spec.md") yield full;
    }
  }
}
