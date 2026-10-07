import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

/**
 * The `assets/` directory that sits next to a compiled module file. Each module
 * calls this with its own `import.meta.url` to locate its bundled markdown/data
 * (copied into dist/ by the build's copy-assets step).
 */
export function assetsDir(importMetaUrl: string): string {
  return path.join(path.dirname(fileURLToPath(importMetaUrl)), "assets");
}

/**
 * `p` with symlinks resolved in its longest existing prefix (a deleted file or
 * directory keeps its missing tail), so `/var/…` and `/private/var/…` spellings
 * of one path compare equal even after the file is gone.
 *
 * @param p - An absolute path.
 */
export function realPathOf(p: string): string {
  const tail: string[] = [];
  let cur = path.resolve(p);
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}
