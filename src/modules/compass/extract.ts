import type { Node } from "web-tree-sitter";
import { LangConfig } from "./languages.js";
import { parse } from "./parser.js";
import { rawHash, structuralHash } from "./hash.js";

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
  /** sha256-128 of exact source bytes for the definition span. */
  bodyHash: string;
  /** sha256-128 of the structural normalizer walk (comment/format invariant). */
  normHash: string;
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
        symbols.push({
          name,
          kind: kinds.get(node.type)!,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startByte: node.startIndex,
          endByte: node.endIndex,
          parentIndex: ownerIndex,
          signature: signatureOf(node),
          bodyHash: rawHash(source, node.startIndex, node.endIndex),
          normHash: structuralHash(node),
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
