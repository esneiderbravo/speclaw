/** Markers for the regenerable map block inside `docs/compass.md` (see compass/map.ts). */
export const COMPASS_MAP_START = "<!-- speclaw:map:start -->";
export const COMPASS_MAP_END = "<!-- speclaw:map:end -->";

/** The project-relative path of the Compass guide that carries the generated map. */
export const COMPASS_DOC = "docs/compass.md";

/**
 * Strip the regenerable map body between markers. `speclaw index` rewrites it on
 * every full run, so integrity digests and "did the agent change this file?"
 * checks must both ignore it.
 *
 * @param text - Full docs/compass.md contents.
 * @returns The same text with an empty map body, or `text` if markers are missing.
 */
export function stripCompassMapBlock(text: string): string {
  const start = text.indexOf(COMPASS_MAP_START);
  const end = text.indexOf(COMPASS_MAP_END);
  if (start < 0 || end < 0 || end < start) return text;
  return text.slice(0, start + COMPASS_MAP_START.length) + "\n" + text.slice(end);
}
