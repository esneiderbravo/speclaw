import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The `assets/` directory that sits next to a compiled module file. Each module
 * calls this with its own `import.meta.url` to locate its bundled markdown/data
 * (copied into dist/ by the build's copy-assets step).
 */
export function assetsDir(importMetaUrl: string): string {
  return path.join(path.dirname(fileURLToPath(importMetaUrl)), "assets");
}
