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
  /** Inclusive start offset — a UTF-16 code-unit index into the decoded source, despite the name. */
  startByte: number;
  /** Exclusive end offset — a UTF-16 code-unit index into the decoded source, despite the name. */
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

/** A call, import, or type reference found within a source file. */
export interface ExtractedRef {
  /**
   * Callee name for a call; the referenced type name for a `ref`; for an
   * import, the whole statement (whitespace collapsed, ≤1024 chars).
   */
  name: string;
  /** `ref`: a TS/JS type annotation or `extends`/`implements` clause naming a type. */
  kind: "call" | "import" | "ref";
  line: number;
  /** Enclosing symbol index, or null for file scope (owned by the file-owner node). */
  ownerIndex: number | null;
  /**
   * The edge's `is_member` value. `1` for a member call on a foreign receiver
   * (`items.push()`, `a.b.f()`, `f().g()`): not `this`/`super` (Python
   * `self`/`cls`) and not an import binding of the same file; never resolved by
   * global name. `2` for a JS/TS member call whose receiver is an import binding
   * (`svc.getUser()`): resolved only once that binding's import ({@link spec})
   * resolves to a project file, so package receivers (`path.parse()`) stay
   * foreign. `0` otherwise, and always for imports.
   */
  member: 0 | 1 | 2;
  /**
   * JS/TS module specifier: on an import, its own; on a call whose receiver
   * (member call) or callee (bare call) is an import binding, that binding's.
   * Null otherwise and for Python.
   */
  spec: string | null;
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
  /** Inclusive start offset — a UTF-16 code-unit index into the decoded source, despite the name. */
  startByte: number;
  /** Exclusive end offset — a UTF-16 code-unit index into the decoded source, despite the name. */
  endByte: number;
  endLine: number;
}

/** The result of extracting a source file: its definitions and their references. */
export interface Extraction {
  symbols: ExtractedSymbol[];
  refs: ExtractedRef[];
  coverage: ExtractedCoverage[];
  /**
   * JS/TS module specifiers this file re-exports (`export * from "./x"`,
   * `export { a } from "./x"`). A re-export binds no local name and is not an
   * import reference; the indexer only uses it to give the file a file-owner
   * node, so an import of a pure barrel resolves to the barrel.
   */
  reexports: string[];
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

/** Python receivers that mean "this class/instance". */
const PY_SELF = new Set(["self", "cls"]);

/**
 * Type names that never become a `ref` edge: TypeScript lib and utility types
 * and JS built-in constructors (predefined types like `string` are separate
 * tree-sitter nodes and never reach here; they are listed for safety).
 */
const BUILTIN_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "object",
  "any",
  "unknown",
  "never",
  "void",
  "undefined",
  "null",
  "Array",
  "ReadonlyArray",
  "ArrayLike",
  "Promise",
  "PromiseLike",
  "Awaited",
  "Record",
  "Partial",
  "Required",
  "Readonly",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
  "NonNullable",
  "ReturnType",
  "Parameters",
  "ConstructorParameters",
  "InstanceType",
  "ThisType",
  "ThisParameterType",
  "OmitThisParameter",
  "Uppercase",
  "Lowercase",
  "Capitalize",
  "Uncapitalize",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "WeakRef",
  "ReadonlyMap",
  "ReadonlySet",
  "Date",
  "RegExp",
  "Error",
  "TypeError",
  "RangeError",
  "Function",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "BigInt",
  "Iterable",
  "Iterator",
  "IterableIterator",
  "AsyncIterable",
  "AsyncIterator",
  "AsyncIterableIterator",
  "Generator",
  "AsyncGenerator",
  "PropertyKey",
  "JSON",
  "Math",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "TemplateStringsArray",
]);

/** AST nodes whose subtree names types: annotations and heritage clauses. */
const TYPE_REF_NODES = new Set([
  "type_annotation",
  "extends_type_clause",
  "implements_clause",
  "extends_clause",
]);

/** A type named in an annotation or heritage clause; `qualifier` is `ns` of `ns.Type`. */
interface TypeName {
  name: string;
  line: number;
  /** Start byte of the name, to test it against type-parameter scopes. */
  pos: number;
  /** null: a bare name; an identifier: an `ns.Type` qualifier; "": a longer chain. */
  qualifier: string | null;
}

/** `Type` of a qualified `ns.Type` / `a.b.Type` node, with its qualifier. */
function qualifiedTypeName(node: Node, nameType: string): TypeName | null {
  let name: Node | null = null;
  let module: Node | null = null;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (!c) continue;
    if (c.type === nameType) name = c;
    else if (module === null && c.type !== ".") module = c;
  }
  if (!name) return null;
  return {
    name: name.text,
    line: name.startPosition.row + 1,
    pos: name.startIndex,
    qualifier: module?.type === "identifier" ? module.text : "",
  };
}

/** Collect every type named inside a type subtree (generic arguments included). */
function typeNamesIn(node: Node, out: TypeName[]): void {
  if (node.type === "type_identifier") {
    out.push({
      name: node.text,
      line: node.startPosition.row + 1,
      pos: node.startIndex,
      qualifier: null,
    });
    return;
  }
  if (node.type === "nested_type_identifier") {
    const q = qualifiedTypeName(node, "type_identifier");
    if (q) out.push(q);
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c) typeNamesIn(c, out);
  }
}

/**
 * Types a heritage or annotation node names. A class `extends` value is an
 * expression (`Base`, `ns.Base`), not a type node, so it is read directly.
 */
function typeRefsOf(node: Node): TypeName[] {
  const out: TypeName[] = [];
  if (node.type !== "extends_clause" && node.type !== "class_heritage") {
    typeNamesIn(node, out);
    return out;
  }
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (!c) continue;
    if (c.type === "identifier") {
      out.push({ name: c.text, line: c.startPosition.row + 1, pos: c.startIndex, qualifier: null });
    } else if (c.type === "member_expression") {
      const q = qualifiedTypeName(c, "property_identifier");
      if (q) out.push(q);
    } else if (c.type === "type_arguments") {
      typeNamesIn(c, out);
    }
  }
  return out;
}

/**
 * The receiver of a member call (`recv.f()`), or null for a plain call.
 * `kind` is `self` for `this`/`super`/`self`/`cls`, `ident` for a bare
 * identifier (classified later against the file's import bindings), and
 * `other` for any chain, subscript, or call result.
 */
function callReceiver(
  node: Node,
  lang: LangConfig,
): { kind: "self" | "ident" | "other"; text: string } | null {
  const fn = node.childForFieldName(lang.callField);
  if (!fn) return null;
  if (fn.type === "identifier" || fn.type === "super") return null;
  if (fn.type !== "member_expression" && fn.type !== "attribute") {
    return { kind: "other", text: fn.text };
  }
  const obj = fn.childForFieldName("object");
  if (!obj) return { kind: "other", text: fn.text };
  if (obj.type === "this" || obj.type === "super") return { kind: "self", text: obj.text };
  if (obj.type === "identifier") {
    // Python's `self`/`cls` are conventions, not keywords; JS `self` is a global.
    if (lang.id === "python" && PY_SELF.has(obj.text)) return { kind: "self", text: obj.text };
    return { kind: "ident", text: obj.text };
  }
  return { kind: "other", text: obj.text };
}

/** Longest import text stored on an edge (`dst_name`). */
export const IMPORT_TEXT_CAP = 1024;

/**
 * Module specifier of a raw import statement (`from "x"`, `import "x"`,
 * `require("x")`, `import("x")`), or null when the text has none.
 *
 * @param text - Import statement text, whitespace collapsed.
 */
export function importSpecifier(text: string): string | null {
  const m =
    text.match(/\bfrom\s+['"]([^'"]+)['"]/) ??
    text.match(/^import\s+['"]([^'"]+)['"]/) ??
    text.match(/\brequire\s*\(\s*['"]([^'"]+)['"]/) ??
    text.match(/\bimport\s*\(\s*['"]([^'"]+)['"]/);
  return m ? m[1]! : null;
}

/**
 * Import text as stored on its edge: unchanged up to {@link IMPORT_TEXT_CAP}
 * characters, else the head of the statement, ` … `, and its trailing `from`
 * clause, so the specifier at the end survives the cap. Bindings and the
 * specifier are read from the full text before capping; this only bounds what
 * is stored.
 *
 * @param text - Import statement text, whitespace collapsed.
 */
export function capImportText(text: string): string {
  if (text.length <= IMPORT_TEXT_CAP) return text;
  const tail =
    text.match(/\s(from\s+['"][^'"]+['"].*)$/)?.[1] ??
    text.match(/((?:require|import)\s*\(\s*['"][^'"]+['"].*)$/)?.[1];
  if (!tail || tail.length > IMPORT_TEXT_CAP / 2) return text.slice(0, IMPORT_TEXT_CAP);
  return `${text.slice(0, IMPORT_TEXT_CAP - tail.length - 3)} … ${tail}`;
}

/**
 * Local names an import statement binds: default, namespace (`* as ns`), and
 * named (`{ a, b as c }` → `a`, `c`) for JS/TS; `import a.b` → `a`,
 * `import x as y` → `y`, `from m import a, b as c` → `a`, `c` for Python.
 *
 * @param text - Import statement text, whitespace collapsed.
 * @param langId - Language id of the file.
 */
export function importBindings(text: string, langId: string): string[] {
  const out: string[] = [];
  const ident = /^[A-Za-z_$][\w$]*$/;
  const localOf = (part: string): string | null => {
    const bits = part.trim().split(/\s+as\s+/);
    const name = (bits[1] ?? bits[0] ?? "").trim().replace(/^type\s+/, "");
    return ident.test(name) ? name : null;
  };
  if (langId === "python") {
    const from = text.match(/^from\s+\S+\s+import\s+(.+)$/);
    const list = from ? from[1]! : (text.match(/^import\s+(.+)$/)?.[1] ?? "");
    for (const raw of list.replace(/[()]/g, "").split(",")) {
      const bits = raw.trim().split(/\s+as\s+/);
      const name = bits[1] ?? (from ? bits[0] : bits[0]?.split(".")[0]);
      if (name && ident.test(name.trim())) out.push(name.trim());
    }
    return out;
  }
  const clause = text.match(/^import\s+(?:type\s+)?(.+?)\s+from\s/)?.[1];
  if (!clause) return out;
  const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (ns) out.push(ns[1]!);
  const brace = clause.match(/\{([^}]*)\}/);
  if (brace) {
    for (const part of brace[1]!.split(",")) {
      const name = localOf(part);
      if (name) out.push(name);
    }
  }
  const def = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
  if (def) out.push(def[1]!);
  return out;
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
  // Identifier receivers and bare callees are classified after the walk, once
  // every import binding of the file is known (imports may follow their first
  // use). Whether a binding is a package is not decided here: that needs the
  // project's alias/baseUrl config, so resolveEdges decides it from whether the
  // binding's import (matched by `spec`) resolved to a project file.
  const identReceivers: Array<{ ref: ExtractedRef; receiver: string }> = [];
  const bareCalls: ExtractedRef[] = [];
  // Type references: one per (owner, name); qualified ones are classified like
  // member calls once the import bindings are known. A bare name inside the
  // declaration that introduces a same-named type parameter (`<Props>`) is that
  // parameter and is dropped; the same name elsewhere in the file is kept.
  const typeNames: Array<{ t: TypeName; ownerIndex: number | null }> = [];
  const typeParamScopes: Array<{ name: string; start: number; end: number }> = [];
  const bindings = new Set<string>();
  // JS/TS import binding → its import's module specifier.
  const bindingSpecs = new Map<string, string>();
  const reexports: string[] = [];

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
      if (name) {
        const receiver = callReceiver(node, lang);
        const ref: ExtractedRef = {
          name,
          kind: "call",
          line: node.startPosition.row + 1,
          ownerIndex,
          member: receiver !== null && receiver.kind === "other" ? 1 : 0,
          spec: null,
        };
        if (receiver?.kind === "ident") identReceivers.push({ ref, receiver: receiver.text });
        else if (receiver === null) bareCalls.push(ref);
        refs.push(ref);
      }
    } else if (importSet.has(node.type)) {
      // Covers: req~import-resolution~1
      // The whole statement, so a specifier on a later line is still parseable.
      // Bindings and the specifier come from the full text; only storage is capped.
      const text = node.text.replace(/\s+/g, " ").trim();
      const bound = importBindings(text, lang.id);
      const spec = lang.id === "python" ? null : importSpecifier(text);
      for (const b of bound) {
        bindings.add(b);
        if (spec !== null) bindingSpecs.set(b, spec);
      }
      refs.push({
        name: capImportText(text),
        kind: "import",
        line: node.startPosition.row + 1,
        ownerIndex,
        member: 0,
        spec,
      });
    } else if (
      lang.id !== "python" &&
      (TYPE_REF_NODES.has(node.type) ||
        (lang.id === "javascript" && node.type === "class_heritage"))
    ) {
      // Covers: req~type-ref-edges~1
      for (const t of typeRefsOf(node)) {
        if (t.qualifier === null && BUILTIN_TYPES.has(t.name)) continue;
        typeNames.push({ t, ownerIndex });
      }
    } else if (node.type === "type_parameter") {
      // Scope: the declaration owning the `<…>` list (function, method, arrow,
      // class, interface, type alias, function type), never the whole file.
      const name = node.child(0);
      const scope = node.parent?.parent ?? node.parent;
      if (name?.type === "type_identifier" && scope) {
        typeParamScopes.push({ name: name.text, start: scope.startIndex, end: scope.endIndex });
      }
    } else if (COMMENT_TYPES.has(node.type)) {
      rawCoverage.push(...parseCoverageComment(node, ownerIndex));
    } else if (node.type === "export_statement" && lang.id !== "python") {
      const source = node.childForFieldName("source");
      if (source && source.text.length >= 2) reexports.push(source.text.slice(1, -1));
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, nextOwner);
    }
  };

  walk(tree.rootNode, null);
  tree.delete();
  for (const { ref, receiver } of identReceivers) {
    const spec = bindingSpecs.get(receiver) ?? null;
    ref.member = !bindings.has(receiver) ? 1 : spec !== null ? 2 : 0;
    ref.spec = spec;
  }
  for (const ref of bareCalls) ref.spec = bindingSpecs.get(ref.name) ?? null;
  // A bare type name carries its import binding's spec (resolved like a bare
  // call); `ns.Type` on an import binding is a member ref (2), else foreign (1).
  // Scoped type parameters are filtered before de-duplication, so a dropped
  // parameter never hides a real reference of the same owner.
  const typeRefKeys = new Set<string>();
  for (const { t, ownerIndex } of typeNames) {
    if (
      t.qualifier === null &&
      typeParamScopes.some((p) => p.name === t.name && p.start <= t.pos && t.pos < p.end)
    ) {
      continue;
    }
    const key = `${ownerIndex ?? "file"}:${t.name}`;
    if (typeRefKeys.has(key)) continue;
    typeRefKeys.add(key);
    let member: ExtractedRef["member"] = 0;
    let spec: string | null;
    if (t.qualifier === null) {
      spec = bindingSpecs.get(t.name) ?? null;
    } else {
      spec = t.qualifier ? (bindingSpecs.get(t.qualifier) ?? null) : null;
      member = spec !== null ? 2 : 1;
    }
    refs.push({ name: t.name, kind: "ref", line: t.line, ownerIndex, member, spec });
  }
  return { symbols, refs, coverage: attachCoverage(rawCoverage, symbols), reexports };
}
