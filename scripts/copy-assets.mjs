// Copy each module's assets/ from src into the compiled dist tree, so a module
// can resolve its bundled markdown/data relative to its own compiled file.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SRC_MODULES = "src/modules";
const DIST_MODULES = "dist/modules";

let copied = 0;
for (const mod of readdirSync(SRC_MODULES)) {
  const from = join(SRC_MODULES, mod, "assets");
  if (!existsSync(from)) continue;
  const to = join(DIST_MODULES, mod, "assets");
  rmSync(to, { recursive: true, force: true }); // clean first so deletions propagate
  cpSync(from, to, { recursive: true });
  copied++;
}
console.log(`copy-assets: copied assets for ${copied} module(s)`);
