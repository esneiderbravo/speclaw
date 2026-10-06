// The brand palette the site retired. Shared by the brand-asset and viewer
// tests so both search for exactly the set `specs/brand` names.
export const RETIRED_HEXES = [
  "#0B0F10",
  "#0A0E0F",
  "#0C1113",
  "#0E1517",
  "#1B2225",
  "#232A2D",
  "#F4F1EA",
  "#2EE6E6",
  "#17C1C1",
  "#0E8E8E",
  "#6E7B80",
  "#8B989E",
  "#3FB950",
  "#E3B341",
  "#EB5A5A",
] as const;

/** Every retired hex found in `text`, compared case-insensitively. */
export function retiredHexesIn(text: string): string[] {
  const lower = text.toLowerCase();
  return RETIRED_HEXES.filter((hex) => lower.includes(hex.toLowerCase()));
}

/** WCAG 2.x relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
