import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The package.json sits at the package root — two levels up from this compiled
// file (dist/shared/version.js -> dist -> <root>). Read once and cache.
let cached: { name: string; version: string } | null = null;

function readPkg(): { name: string; version: string } {
  if (cached) return cached;
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "package.json",
  );
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    cached = {
      name: String(pkg.name ?? "@esneiderbravo/speclaw"),
      version: String(pkg.version ?? "0.0.0"),
    };
  } catch {
    cached = { name: "@esneiderbravo/speclaw", version: "0.0.0" };
  }
  return cached;
}

/** The published package name (e.g. `@esneiderbravo/speclaw`). */
export function pkgName(): string {
  return readPkg().name;
}

/** The currently installed package version (e.g. `0.1.4`). */
export function pkgVersion(): string {
  return readPkg().version;
}
