import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** Directory holding the pre-built tree-sitter WASM grammars. */
function wasmDir(): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out");
}

/** Maps a tree-sitter definition node type to the symbol kind Compass records. */
export interface DefRule {
  /** tree-sitter node type that denotes a definition. */
  node: string;
  /** symbol kind we record. */
  kind: string;
  /** field name holding the identifier (default "name"). */
  nameField?: string;
  /** when set, resolve the name from a child of this type instead of a field. */
  nameChild?: string;
}

/** Per-language configuration driving parsing and symbol/reference extraction. */
export interface LangConfig {
  id: string;
  grammar: string; // wasm file base name
  extensions: string[];
  defs: DefRule[];
  /** node types that represent a call expression. */
  callNode: string;
  /** field of the call node holding the callee. */
  callField: string;
  /** node types representing an import/require statement. */
  importNodes: string[];
}

export const LANGUAGES: LangConfig[] = [
  {
    id: "python",
    grammar: "tree-sitter-python",
    extensions: [".py", ".pyi"],
    defs: [
      { node: "function_definition", kind: "function" },
      { node: "class_definition", kind: "class" },
    ],
    callNode: "call",
    callField: "function",
    importNodes: ["import_statement", "import_from_statement"],
  },
  {
    id: "javascript",
    grammar: "tree-sitter-javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    defs: [
      { node: "function_declaration", kind: "function" },
      { node: "class_declaration", kind: "class" },
      { node: "method_definition", kind: "method" },
    ],
    callNode: "call_expression",
    callField: "function",
    importNodes: ["import_statement"],
  },
  {
    id: "typescript",
    grammar: "tree-sitter-typescript",
    extensions: [".ts", ".tsx", ".mts", ".cts"],
    defs: [
      { node: "function_declaration", kind: "function" },
      { node: "class_declaration", kind: "class" },
      { node: "method_definition", kind: "method" },
      { node: "interface_declaration", kind: "interface" },
      { node: "type_alias_declaration", kind: "type" },
      { node: "enum_declaration", kind: "enum" },
    ],
    callNode: "call_expression",
    callField: "function",
    importNodes: ["import_statement"],
  },
];

const BY_EXT = new Map<string, LangConfig>();
for (const lang of LANGUAGES) {
  for (const ext of lang.extensions) BY_EXT.set(ext, lang);
}

/**
 * Resolve the language configuration for a file by its extension.
 *
 * @returns The matching {@link LangConfig}, or `undefined` for unsupported files.
 */
export function langForPath(filePath: string): LangConfig | undefined {
  return BY_EXT.get(path.extname(filePath).toLowerCase());
}

/** Absolute path to the tree-sitter WASM grammar file for a language. */
export function grammarPath(lang: LangConfig): string {
  return path.join(wasmDir(), `${lang.grammar}.wasm`);
}
