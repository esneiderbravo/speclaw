import { createHash } from "node:crypto";

/**
 * Bump when the text (or metadata) fed to the embedder changes shape.
 * Combined into LexicalEmbedder.id so stale cache rows never match.
 */
export const EMBED_INPUT_VERSION = "in2";

/** Inputs that uniquely determine an embedding vector for a symbol. */
export interface EmbedInputParts {
  lang: string;
  kind: string;
  name: string;
  signature?: string | null;
  embedText: string;
}

/**
 * Content-addressable key for `embedding_cache`: hash of the embedder recipe,
 * not the file path and not solely `body_hash` (drift uses a different recipe).
 *
 * @param input - Language, kind, name, optional signature, and embedder text.
 */
export function contentHashFor(input: EmbedInputParts): string {
  return createHash("sha256")
    .update(
      [
        EMBED_INPUT_VERSION,
        input.lang,
        input.kind,
        input.name,
        input.signature ?? "",
        input.embedText,
      ].join("\0"),
    )
    .digest("hex");
}

/** Default embedder text for a symbol (matches historical indexer behaviour). */
export function defaultEmbedText(kind: string, name: string, signature?: string | null): string {
  return `${kind} ${name} ${signature ?? ""}`;
}
