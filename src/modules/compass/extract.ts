import type { Node } from "web-tree-sitter";
import { LangConfig } from "./languages.js";
import { parse } from "./parser.js";

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
}

/** A call or import reference found within a source file. */
export interface ExtractedRef {
  name: string;
  kind: "call" | "import";
  line: number;
  ownerIndex: number | null; // enclosing symbol index, or null for file scope
}

/** The result of extracting a source file: its definitions and their references. */
export interface Extraction {
  symbols: ExtractedSymbol[];
  refs: ExtractedRef[];
}

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
    const prop =
      fn.childForFieldName("property") ?? fn.childForFieldName("attribute");
    return prop ? prop.text : fn.text;
  }
  if (fn.type === "identifier") return fn.text;
  return fn.text.split(/[.\s(]/)[0] || null;
}

/** First line of the node's text, trimmed — a lightweight signature. */
function signatureOf(node: Node): string {
  return node.text.split("\n")[0]!.trim().slice(0, 200);
}

/**
 * Walk a parsed tree extracting definitions (with nesting) and the call/import
 * references each definition contains. Single traversal, O(nodes).
 *
 * @param source - The full source text of the file.
 * @param lang - Language configuration describing definition/call/import nodes.
 * @returns The extracted symbols and references; `parentIndex`/`ownerIndex`
 * fields index back into the `symbols` array to express nesting and ownership.
 * @throws If the source cannot be parsed for the given language.
 */
export async function extract(
  source: string,
  lang: LangConfig
): Promise<Extraction> {
  const tree = await parse(source, lang);
  const kinds = defKindMap(lang);
  const importSet = new Set(lang.importNodes);
  const symbols: ExtractedSymbol[] = [];
  const refs: ExtractedRef[] = [];

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
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, nextOwner);
    }
  };

  walk(tree.rootNode, null);
  tree.delete();
  return { symbols, refs };
}
