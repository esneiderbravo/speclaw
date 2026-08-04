// Stage the runtime data the compiled tests resolve relative to their own files,
// mirroring what the production build's copy-assets step does for dist/:
//   1. package.json -> dist-test/package.json, so src/shared/version.ts resolves
//      the real name/version (it reads ../../package.json from its compiled path).
//   2. each module's assets/ -> dist-test/src/modules/<mod>/assets, so scaffold,
//      the pack loader, and the workflow installer find their bundled templates.
// Run after `tsc -p tsconfig.test.json` and before `node --test`.
import { cpSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC_MODULES = "src/modules";
const DEST_MODULES = "dist-test/src/modules";

copyFileSync("package.json", "dist-test/package.json");

let copied = 0;
for (const mod of readdirSync(SRC_MODULES)) {
  const from = join(SRC_MODULES, mod, "assets");
  if (!existsSync(from)) continue;
  cpSync(from, join(DEST_MODULES, mod, "assets"), { recursive: true });
  copied++;
}
console.log(`prep-test-assets: package.json + assets for ${copied} module(s)`);
