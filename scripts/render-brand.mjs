import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
const names = ["speclaw-banner","terminal-init","terminal-quickstart","terminal-cli","terminal-mcp","terminal-tree"];
for (const n of names) {
  const svg = readFileSync(`brand/${n}.svg`,"utf8");
  const r = new Resvg(svg, { fitTo:{ mode:"zoom", value:2 }, font:{ loadSystemFonts:true } });
  writeFileSync(`brand/${n}.png`, r.render().asPng());
  console.log("→", `brand/${n}.png`);
}
