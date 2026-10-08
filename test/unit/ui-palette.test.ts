// Covers: req~brand-terminal-palette~1
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { LIGHT_PALETTE, PALETTE, themeFromEnv, themeFromOsc11 } from "../../src/cli/lib/ui.js";
import { contrast } from "../helpers/brand.js";

const UI_MODULE = new URL("../../src/cli/lib/ui.js", import.meta.url).href;

const hex = (rgb: readonly number[]): string =>
  "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

/** Paint `x` with `c.<slot>` in a fresh process, so the module-load color check sees `env`. */
function paintInChild(slot: string, env: NodeJS.ProcessEnv): string {
  const script = `import { c } from ${JSON.stringify(UI_MODULE)}; process.stdout.write(c.${slot}("x"));`;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env,
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

function envWithout(...keys: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of keys) delete env[k];
  return env;
}

test("accent, text, secondary, and error slots come from the site tokens", () => {
  assert.equal(hex(PALETTE.cyan), "#00e3fd");
  assert.equal(hex(PALETTE.cyanDim), "#00e3fd");
  assert.equal(hex(PALETTE.cream), "#f4f4f3");
  assert.equal(hex(PALETTE.muted), "#999ea3");
  assert.equal(hex(PALETTE.red), "#ff5c47");
});

test("success and warning stay green and amber", () => {
  const [gr, gg, gb] = PALETTE.green;
  assert.ok(gg > gr && gg > gb, `green slot ${hex(PALETTE.green)} is green-dominant`);
  const [ar, ag, ab] = PALETTE.amber;
  assert.ok(ar > ab && ag > ab && ar >= ag, `amber slot ${hex(PALETTE.amber)} is amber`);
});

test("every palette color holds at least 4.5:1 on the ink paper", () => {
  for (const [slot, rgb] of Object.entries(PALETTE)) {
    const ratio = contrast(hex(rgb), "#131313");
    assert.ok(ratio >= 4.5, `${slot} ${hex(rgb)} is ${ratio.toFixed(2)}:1 on #131313`);
  }
});

test("forced color paints the accent as signal truecolor", () => {
  const out = paintInChild("cyan", {
    ...envWithout("NO_COLOR", "SPECLAW_THEME", "COLORFGBG"),
    FORCE_COLOR: "1",
  });
  assert.equal(out, "\x1b[38;2;0;227;253mx\x1b[0m");
});

test("NO_COLOR keeps every slot plain", () => {
  // FORCE_COLOR=1 would paint on its own (the child's stdout is a pipe, not a
  // TTY), so only the NO_COLOR clause can keep this output plain.
  for (const slot of Object.keys(PALETTE)) {
    const out = paintInChild(slot, { ...process.env, FORCE_COLOR: "1", NO_COLOR: "1" });
    assert.equal(out, "x", `${slot} emits no escape under NO_COLOR`);
  }
});

test("every light palette color holds at least 4.5:1 on white paper", () => {
  assert.deepEqual(Object.keys(LIGHT_PALETTE).sort(), Object.keys(PALETTE).sort());
  for (const [slot, rgb] of Object.entries(LIGHT_PALETTE)) {
    const ratio = contrast(hex(rgb), "#ffffff");
    assert.ok(ratio >= 4.5, `${slot} ${hex(rgb)} is ${ratio.toFixed(2)}:1 on #ffffff`);
  }
});

test("SPECLAW_THEME wins, then COLORFGBG's background decides", () => {
  assert.equal(themeFromEnv({ SPECLAW_THEME: "Light", COLORFGBG: "15;0" }), "light");
  assert.equal(themeFromEnv({ SPECLAW_THEME: "dark", COLORFGBG: "0;15" }), "dark");
  assert.equal(themeFromEnv({ COLORFGBG: "0;15" }), "light");
  assert.equal(themeFromEnv({ COLORFGBG: "0;default;7" }), "light");
  assert.equal(themeFromEnv({ COLORFGBG: "15;0" }), "dark");
  assert.equal(themeFromEnv({}), undefined);
});

test("an OSC 11 reply maps the background luminance to a theme", () => {
  assert.equal(themeFromOsc11("\x1b]11;rgb:ffff/ffff/ffff\x07"), "light");
  assert.equal(themeFromOsc11("\x1b]11;rgb:13/13/13\x1b\\"), "dark");
  assert.equal(themeFromOsc11(""), undefined);
});

test("SPECLAW_THEME=light paints the accent with the light palette", () => {
  const out = paintInChild("cyan", {
    ...envWithout("NO_COLOR", "COLORFGBG"),
    FORCE_COLOR: "1",
    SPECLAW_THEME: "light",
  });
  assert.equal(out, "\x1b[38;2;0;122;140mx\x1b[0m");
});
