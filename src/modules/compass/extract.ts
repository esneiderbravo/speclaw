import type { Node } from "web-tree-sitter";
import { LangConfig } from "./languages.js";
import { parse } from "./parser.js";
import { rawHash, structuralHash } from "./hash.js";
import { tokenize } from "./embedder.js";

/** A definition (function, class, method, type) found in a source file. */
export interface ExtractedSymbol {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
  parentIndex: number | null; // index into the symbols array
  signature: string | null;
  /** Docstring / leading JSDoc immediately associated with the definition. */
  docstring: string;
  /** Space-separated name subtokens for FTS (e.g. "get user by id"). */
  subtokens: string;
  /** sha256-128 of exact source bytes for the definition span. */
  bodyHash: string;
  /** sha256-128 of the structural normalizer walk (comment/format invariant). */
  normHash: string;
  /** Lines spanned by the definition (`endLine - startLine + 1`). */
  loc: number;
  /** Deepest nesting of configured block types inside the definition. */
  maxNesting: number;
  /** Decision-point count (control-flow nodes + boolean &&/|| / and/or). */
  branches: number;
}

/** A call or import reference found within a source file. */
export interface ExtractedRef {
  name: string;
  kind: "call" | "import";
  line: number;
  ownerIndex: number | null; // enclosing symbol index, or null for file scope
}

/**
 * A requirement-coverage directive found in a comment node
 * (`// Covers: req~name~1`, `# Covers:`, `@covers`).
 */
export interface ExtractedCoverage {
  kind: "covers" | "needs";
  artifactType: string;
  name: string;
  revision: number;
  line: number;
  /** Preferred symbol index (next def within 2 lines, else innermost container). */
  ownerIndex: number | null;
  startByte: number;
  endByte: number;
  endLine: number;
}

/** The result of extracting a source file: its definitions and their references. */
export interface Extraction {
  symbols: ExtractedSymbol[];
  refs: ExtractedRef[];
  coverage: ExtractedCoverage[];
}

const COMMENT_TYPES = new Set(["comment", "line_comment", "block_comment"]);
/** `Covers:` / `Needs:` / `@covers` at the start of a comment line. */
const RE_DIRECTIVE = /(?:^|\s|\*)\s*(?:@)?(covers|needs)\s*:?\s+([^\n*]+)/i;
/** One OFT-shaped id: type~name~revision. */
const RE_ID = /\b([a-z]{2,6})~([A-Za-z0-9._-]+)~(\d+)\b/g;

const DEF_LOOKUP = new WeakMap<LangConfig, Map<string, string>>();

function defKindMap(lang: LangConfig): Map<string, string> {
  let m = DEF_LOOKUP.get(lang);
  if (!m) {
    m = new Map(lang.defs.map((d) => [d.node, d.kind]));
    DEF_LOOKUP.set(lang, m);
  }
  return m;
}

/** Resolve the identifier name a definition node declares. */
function defName(node: Node): string | null {
  const field = node.childForFieldName("name");
  return field ? field.text : null;
}

/** Resolve the final callee name from a call node's function field. */
function calleeName(node: Node, lang: LangConfig): string | null {
  const fn = node.childForFieldName(lang.callField);
  if (!fn) return null;
  // a.b.c() -> c ; foo() -> foo
  if (fn.type === "member_expression" || fn.type === "attribute") {
    const prop = fn.childForFieldName("property") ?? fn.childForFieldName("attribute");
    return prop ? prop.text : fn.text;
  }
  if (fn.type === "identifier") return fn.text;
  return fn.text.split(/[.\s(]/)[0] || null;
}

/** First line of the node's text, trimmed — a lightweight signature. */
function signatureOf(node: Node): string {
  return node.text.split("\n")[0]!.trim().slice(0, 200);
}

/** Strip comment delimiters from a block/line comment. */
function stripCommentText(raw: string): string {
  return raw
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .replace(/^\/\//, "")
    .replace(/^\s*\*/gm, "")
    .trim()
    .slice(0, 2000);
}

/**
 * Docstring for a definition: prior block/JSDoc comment (TS/JS) or first string
 * literal in the body (Python).
 *
 * @param node - Definition AST node.
 * @param lang - Language config (`id` selects strategy).
 */
export function docstringOf(node: Node, lang: LangConfig): string {
  if (lang.id === "python") {
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const child = body.child(i);
        if (!child) continue;
        if (child.type === "expression_statement") {
          const inner = child.child(0);
          if (inner && (inner.type === "string" || inner.type === "concatenated_string")) {
            return inner.text
              .replace(/^['"]{1,3}|['"]{1,3}$/g, "")
              .trim()
              .slice(0, 2000);
          }
        }
        if (COMMENT_TYPES.has(child.type)) continue;
        break;
      }
    }
    return "";
  }

  let prev = node.previousSibling;
  while (prev) {
    if (COMMENT_TYPES.has(prev.type)) {
      const t = prev.text.trim();
      if (t.startsWith("/**") || t.startsWith("/*") || t.startsWith("//")) {
        return stripCommentText(t);
      }
      prev = prev.previousSibling;
      continue;
    }
    if (prev.type === "decorator" || prev.type === "decorator_list") {
      prev = prev.previousSibling;
      continue;
    }
    break;
  }

  // JSDoc often sits before `export function` / `export class` (parent statement).
  const parent = node.parent;
  if (parent && (parent.type === "export_statement" || parent.type === "lexical_declaration")) {
    let p = parent.previousSibling;
    while (p) {
      if (COMMENT_TYPES.has(p.type)) {
        const t = p.text.trim();
        if (t.startsWith("/**") || t.startsWith("/*") || t.startsWith("//")) {
          return stripCommentText(t);
        }
        p = p.previousSibling;
        continue;
      }
      break;
    }
  }
  return "";
}

/**
 * Space-separated lowercase subtokens of a symbol name for FTS.
 *
 * @param name - Identifier.
 */
export function nameSubtokens(name: string): string {
  return tokenize(name).join(" ");
}

const BOOL_OPS = new Set(["&&", "||", "and", "or"]);

/**
 * Compute LOC / max nesting / branch counts for a definition subtree.
 * Nesting depth is relative to the definition body (starts at 0).
 */
export function metricsOf(
  defNode: Node,
  lang: LangConfig,
): {
  loc: number;
  maxNesting: number;
  branches: number;
} {
  const nesting = new Set(lang.nestingNodes);
  const branchesSet = new Set(lang.branchNodes);
  let maxNesting = 0;
  let branches = 0;

  const walk = (node: Node, depth: number): void => {
    const nestHere = nesting.has(node.type);
    const nextDepth = nestHere ? depth + 1 : depth;
    if (nestHere) maxNesting = Math.max(maxNesting, nextDepth);

    if (branchesSet.has(node.type)) {
      branches++;
    } else if (node.type === "binary_expression") {
      const op = node.childForFieldName("operator")?.text ?? "";
      if (BOOL_OPS.has(op)) branches++;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, nextDepth);
    }
  };

  for (let i = 0; i < defNode.childCount; i++) {
    const child = defNode.child(i);
    if (child) walk(child, 0);
  }

  return {
    loc: defNode.endPosition.row - defNode.startPosition.row + 1,
    maxNesting,
    branches,
  };
}

/** Parse Covers:/Needs: directives from a comment node's text. */
function parseCoverageComment(
  node: Node,
  ownerIndex: number | null,
): Omit<ExtractedCoverage, "ownerIndex">[] {
  const text = node.text;
  const dir = RE_DIRECTIVE.exec(text);
  if (!dir) return [];
  const kind = dir[1]!.toLowerCase() as "covers" | "needs";
  const out: Omit<ExtractedCoverage, "ownerIndex">[] = [];
  for (const m of dir[2]!.matchAll(RE_ID)) {
    out.push({
      kind,
      artifactType: m[1]!,
      name: m[2]!,
      revision: Number(m[3]),
      line: node.startPosition.row + 1,
      startByte: node.startIndex,
      endByte: node.endIndex,
      endLine: node.endPosition.row + 1,
    });
  }
  // silence unused until attribution; ownerIndex filled by attachCoverage
  void ownerIndex;
  return out;
}

/**
 * Attribute a coverage comment to a symbol: next def within 2 lines, else
 * innermost containing symbol, else file-level (null).
 */
function attachCoverage(
  raw: Omit<ExtractedCoverage, "ownerIndex">[],
  symbols: ExtractedSymbol[],
): ExtractedCoverage[] {
  return raw.map((c) => {
    const next = symbols.find((s) => s.startByte >= c.endByte);
    if (next && next.startLine - c.endLine <= 2) {
      return { ...c, ownerIndex: symbols.indexOf(next) };
    }
    const containing = symbols
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.startByte <= c.startByte && c.endByte <= s.endByte)
      .sort((a, b) => a.s.endByte - a.s.startByte - (b.s.endByte - b.s.startByte));
    if (containing.length > 0) {
      return { ...c, ownerIndex: containing[0]!.i };
    }
    return { ...c, ownerIndex: null };
  });
}

/**
 * Walk a parsed tree extracting definitions (with nesting), call/import
 * references, and requirement-coverage directives from comment nodes. Single
 * traversal, O(nodes).
 *
 * @param source - The full source text of the file.
 * @param lang - Language configuration describing definition/call/import nodes.
 * @returns The extracted symbols, references, and coverage directives;
 * `parentIndex`/`ownerIndex` fields index back into the `symbols` array.
 * @throws If the source cannot be parsed for the given language.
 */
export async function extract(source: string, lang: LangConfig): Promise<Extraction> {
  const tree = await parse(source, lang);
  const kinds = defKindMap(lang);
  const importSet = new Set(lang.importNodes);
  const symbols: ExtractedSymbol[] = [];
  const refs: ExtractedRef[] = [];
  const rawCoverage: Omit<ExtractedCoverage, "ownerIndex">[] = [];

  const walk = (node: Node, ownerIndex: number | null): void => {
    let nextOwner = ownerIndex;

    if (kinds.has(node.type)) {
      const name = defName(node);
      if (name) {
        const index = symbols.length;
        const health = metricsOf(node, lang);
        symbols.push({
          name,
          kind: kinds.get(node.type)!,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startByte: node.startIndex,
          endByte: node.endIndex,
          parentIndex: ownerIndex,
          signature: signatureOf(node),
          docstring: docstringOf(node, lang),
          subtokens: nameSubtokens(name),
          bodyHash: rawHash(source, node.startIndex, node.endIndex),
          normHash: structuralHash(node),
          loc: health.loc,
          maxNesting: health.maxNesting,
          branches: health.branches,
        });
        nextOwner = index;
      }
    } else if (node.type === lang.callNode) {
      const name = calleeName(node, lang);
      if (name) refs.push({ name, kind: "call", line: node.startPosition.row + 1, ownerIndex });
    } else if (importSet.has(node.type)) {
      refs.push({
        name: node.text.split("\n")[0]!.trim().slice(0, 200),
        kind: "import",
        line: node.startPosition.row + 1,
        ownerIndex,
      });
    } else if (COMMENT_TYPES.has(node.type)) {
      rawCoverage.push(...parseCoverageComment(node, ownerIndex));
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, nextOwner);
    }
  };

  walk(tree.rootNode, null);
  tree.delete();
  return { symbols, refs, coverage: attachCoverage(rawCoverage, symbols) };
}
