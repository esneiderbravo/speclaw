import { Parser, Language } from "web-tree-sitter";
import { LangConfig, grammarPath } from "./languages.js";

let initialized = false;
const languageCache = new Map<string, Language>();

async function ensureInit(): Promise<void> {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
}

async function loadLanguage(lang: LangConfig): Promise<Language> {
  const cached = languageCache.get(lang.id);
  if (cached) return cached;
  const loaded = await Language.load(grammarPath(lang));
  languageCache.set(lang.id, loaded);
  return loaded;
}

/**
 * Parse source into a tree-sitter tree for the given language.
 *
 * Lazily initializes tree-sitter and caches the loaded grammar per language.
 *
 * @param source - The source text to parse.
 * @param lang - Language configuration selecting the grammar.
 * @returns The parsed syntax tree; the caller owns it and must `delete()` it.
 * @throws If parsing yields no tree.
 */
export async function parse(
  source: string,
  lang: LangConfig,
): Promise<import("web-tree-sitter").Tree> {
  await ensureInit();
  const parser = new Parser();
  parser.setLanguage(await loadLanguage(lang));
  const tree = parser.parse(source);
  if (!tree) throw new Error(`failed to parse ${lang.id} source`);
  return tree;
}
