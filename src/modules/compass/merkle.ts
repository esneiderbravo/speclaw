import { createHash } from "node:crypto";

/** Stable hash of an empty directory (or fully excluded contents). */
export const HASH_EMPTY = createHash("sha256").update("").digest("hex");

/**
 * Directory Merkle hash: sha256 of sorted `name\\0childHash\\n` lines.
 * Sort uses UTF-8 byte order (never localeCompare) for cross-platform stability.
 *
 * @param children - Immediate children (files or subdirs) with their hashes.
 */
export function dirHash(children: Array<{ name: string; hash: string }>): string {
  if (children.length === 0) return HASH_EMPTY;
  const sorted = [...children].sort((a, b) =>
    Buffer.compare(Buffer.from(a.name, "utf8"), Buffer.from(b.name, "utf8")),
  );
  const h = createHash("sha256");
  for (const c of sorted) h.update(`${c.name}\0${c.hash}\n`);
  return h.digest("hex");
}

/**
 * Rebuild directory hashes bottom-up from relative file paths → content hashes.
 *
 * @param fileHashes - Project-relative paths using `/` separators.
 * @returns Map including every ancestor directory; `""` is the project root.
 */
export function buildDirHashMap(fileHashes: Map<string, string>): Map<string, string> {
  /** dir path → list of direct children {name, hash} (hash filled later for dirs). */
  const children = new Map<string, Map<string, string>>();

  const addChild = (parent: string, name: string, hash: string) => {
    if (!children.has(parent)) children.set(parent, new Map());
    children.get(parent)!.set(name, hash);
  };

  // Ensure root exists even with zero files
  if (!children.has("")) children.set("", new Map());

  for (const [rel, hash] of fileHashes) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let parent = "";
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      if (i === parts.length - 1) {
        addChild(parent, name, hash);
      } else {
        const next = parent ? `${parent}/${name}` : name;
        if (!children.has(next)) children.set(next, new Map());
        // placeholder — overwritten when we hash the child dir
        if (!children.get(parent)!.has(name)) addChild(parent, name, "");
        parent = next;
      }
    }
  }

  const hashes = new Map<string, string>();
  const dirs = [...children.keys()].sort(
    (a, b) => b.split("/").filter(Boolean).length - a.split("/").filter(Boolean).length,
  );

  for (const dir of dirs) {
    const kids = children.get(dir) ?? new Map();
    const list: Array<{ name: string; hash: string }> = [];
    for (const [name, fileHash] of kids) {
      const childPath = dir ? `${dir}/${name}` : name;
      if (children.has(childPath)) {
        list.push({ name, hash: hashes.get(childPath) ?? HASH_EMPTY });
      } else {
        list.push({ name, hash: fileHash });
      }
    }
    hashes.set(dir, dirHash(list));
  }

  if (!hashes.has("")) hashes.set("", HASH_EMPTY);
  return hashes;
}
