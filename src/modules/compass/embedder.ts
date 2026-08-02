import { createHash } from "node:crypto";

/**
 * A pluggable text-to-vector embedding backend used by Compass for semantic
 * recall. Implementations map arbitrary text to a fixed-dimension vector.
 */
export interface Embedder {
  /** Stable identifier of the embedder, stored alongside each embedding. */
  id: string;
  /** Dimensionality of the vectors produced by {@link Embedder.embed}. */
  dim: number;
  /** Embed the given text into a `dim`-length vector (may be async). */
  embed(text: string): Promise<Float32Array> | Float32Array;
}

/**
 * Split identifiers into lowercase subtokens.
 *
 * Splits on camelCase boundaries, snake_case, dots, and other non-word
 * characters, dropping tokens of length 1 or less.
 *
 * @param text - Raw identifier or free text to tokenize.
 * @returns The list of subtokens, lowercased.
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1);
}

/**
 * Zero-dependency, offline lexical embedder. Hashes subtokens into a fixed-dim
 * bag-of-tokens vector, L2-normalized. Captures token overlap similarity —
 * weaker than a neural model but instant, deterministic, and requires no
 * download. The default; swap in a model-backed Embedder for true semantics.
 */
export class LexicalEmbedder implements Embedder {
  readonly id = "lexical-hash-v1";
  constructor(readonly dim = 256) {}

  /**
   * Embed text as an L2-normalized bag-of-hashed-subtokens vector.
   *
   * @param text - Text to embed.
   * @returns A `dim`-length unit vector suitable for cosine comparison.
   */
  embed(text: string): Float32Array {
    const vec = new Float32Array(this.dim);
    for (const tok of tokenize(text)) {
      // two hashed buckets per token (signed) reduce collisions
      const h = createHash("md5").update(tok).digest();
      const bucket = ((h[0]! << 8) | h[1]!) % this.dim;
      const sign = h[2]! & 1 ? 1 : -1;
      vec[bucket]! += sign;
      const bucket2 = ((h[3]! << 8) | h[4]!) % this.dim;
      vec[bucket2]! += sign;
    }
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < vec.length; i++) vec[i]! /= norm;
    return vec;
  }
}

let active: Embedder = new LexicalEmbedder();

/** The currently active embedder (defaults to {@link LexicalEmbedder}). */
export function getEmbedder(): Embedder {
  return active;
}

/** Replace the active embedder used for indexing and recall. */
export function setEmbedder(e: Embedder): void {
  active = e;
}

/** Serialize a vector to a raw little-endian `Float32` blob for storage. */
export function toBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Deserialize a stored blob back into a `Float32Array` vector. */
export function fromBlob(blob: Buffer | Uint8Array): Float32Array {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * Cosine similarity between two vectors.
 *
 * @remarks Assumes both vectors are pre-normalized, so this is just their dot
 * product over the shared prefix length.
 * @returns Similarity in `[-1, 1]`; higher means more similar.
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot; // vectors are pre-normalized
}
