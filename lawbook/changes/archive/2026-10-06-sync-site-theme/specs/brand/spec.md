# Brand

The visual identity speclaw ships in this repository: the color tokens, the
mark, and the typography used by the brand assets under `brand/` (SVG sources
and the PNGs rendered from them by `scripts/render-brand.mjs`), the CLI
truecolor palette in `src/cli/lib/ui.ts`, and the Compass HTML viewer in
`src/modules/compass/visualize.ts`. The source of truth is the speclaw site's
design tokens (`app/tokens.css` in the `speclaw-site` repository): the dark
**ink** theme and the light **bond** theme. This capability governs colors,
mark geometry, and fonts only. When and where the CLI prints its branded header
stays governed by the `cli` capability.

The **retired palette** is the pre-sync set of colors: `#0B0F10`, `#0A0E0F`,
`#0C1113`, `#0E1517`, `#1B2225`, `#232A2D`, `#F4F1EA`, `#2EE6E6`, `#17C1C1`,
`#0E8E8E`, `#6E7B80`, `#8B989E`, `#3FB950`, `#E3B341`, and `#EB5A5A`.

### Requirement: CLI palette follows the ink theme `req~brand-terminal-palette~1`

THE CLI truecolor palette SHALL map its accent to signal `#00e3fd`, its primary
text to ink `#f4f4f3`, its secondary text to ink-faint `#999ea3`, and its error
color to deny `#ff5c47`, SHALL keep a green success color and an amber warning
color, and SHALL give every palette color a WCAG 2.x contrast ratio of at least
4.5:1 against paper `#131313`.

Needs: impl, utest
Status: approved

#### Scenario: Accent, text, and error colors come from the site tokens
- Given the CLI palette in `src/cli/lib/ui.ts`
- When its colors are read
- Then the accent SHALL be `#00e3fd`
- And the primary text SHALL be `#f4f4f3`
- And the secondary text SHALL be `#999ea3`
- And the error color SHALL be `#ff5c47`

#### Scenario: Every palette color is legible on the ink ground
- Given each color in the CLI palette, including success and warning
- When its WCAG contrast against `#131313` is computed
- Then the ratio SHALL be at least 4.5

#### Scenario: Forced color emits the new accent
- Given `FORCE_COLOR=1` and `NO_COLOR` unset
- When the CLI paints text with its accent
- Then the output SHALL contain the truecolor sequence `38;2;0;227;253`

#### Scenario: Disabled color keeps plain text
- Given `NO_COLOR` is set
- When the CLI paints text with any palette color
- Then the output SHALL be the plain text with no escape sequence

### Requirement: Compass viewer follows the ink theme `req~brand-viewer-palette~1`

THE Compass HTML viewer SHALL draw its page on paper `#131313`, its panels on
sheet `#1f2022` with rule `#303236` borders, its text in ink `#f4f4f3` and
ink-faint `#999ea3`, and its accent and active edges in signal `#00e3fd`, and
SHALL NOT contain any color from the retired palette.

Needs: impl, utest
Status: approved

#### Scenario: Viewer HTML uses the ink tokens
- Given a rendered Compass viewer HTML document
- When its styles are read
- Then the page background SHALL be `#131313`
- And the accent SHALL be `#00e3fd`

#### Scenario: Viewer HTML carries no retired color
- Given a rendered Compass viewer HTML document
- When it is searched case-insensitively for each retired palette hex
- Then no retired hex SHALL be found

### Requirement: Brand assets use the site palette and mark

THE SVG sources under `brand/` SHALL take every fill and stroke color from the
ink tokens (dark assets) or the bond tokens (light assets), SHALL draw the mark
as the site mark (a document outline, three ink-faint text lines, and a signal
"law" line that runs past the page's right edge), and SHALL NOT contain any
color from the retired palette.

#### Scenario: Dark assets sit on the ink ground
- Given a dark brand SVG (banner, mark, favicon, diamond, a terminal capture, or
  the Cortex loop)
- When its colors are read
- Then its background, where it draws one, SHALL be paper `#131313` or
  paper-sunk `#0d0d0e`
- And its accent SHALL be signal `#00e3fd`

#### Scenario: Light assets sit on the bond ground
- Given a light brand SVG (`speclaw-banner-light.svg` or
  `speclaw-mark-light.svg`)
- When its colors are read
- Then its background SHALL be bond paper `#f4f4f3` or sheet `#ffffff`
- And its text SHALL be bond ink `#131313`
- And its accent SHALL be bond signal `#00707f`

#### Scenario: The mark matches the site geometry
- Given a brand SVG that draws the mark
- When the mark's shapes are read in its 32-unit coordinate frame
- Then it SHALL have a document rectangle at x 5, y 3.5, width 21, height 25
- And three text lines at y 11, 15.5, and 20
- And a law line at y 24.5 that starts at x 10 and ends past x 26

#### Scenario: No retired color remains in the brand sources
- Given every SVG under `brand/`
- When each is searched case-insensitively for each retired palette hex
- Then no retired hex SHALL be found

### Requirement: Brand typography is Chivo

THE SVG sources under `brand/` SHALL set sans text in `Chivo` and monospace
text in `Chivo Mono`, SHALL NOT name `SF Mono` or `JetBrains Mono` in any font
stack, and SHALL use in text only glyphs the bundled Chivo latin subset can
draw.

#### Scenario: Font stacks name Chivo
- Given every SVG under `brand/` that contains text
- When its `font-family` declarations are read
- Then each SHALL name `Chivo` or `Chivo Mono` first

#### Scenario: Text stays inside the bundled glyph set
- Given every `<text>` element in the SVGs under `brand/`
- When its characters are read
- Then each SHALL be printable ASCII, Latin-1, or punctuation the Chivo latin
  subset carries (en and em dash, curly quotes, bullet, ellipsis)

### Requirement: PNG rendering loads the bundled Chivo fonts

WHEN `npm run brand` renders the PNGs, the renderer SHALL load Chivo and Chivo
Mono from the static per-weight files of the `@fontsource/chivo` and
`@fontsource/chivo-mono` dev dependencies (decoded from WOFF2 with the
`wawoff2` dev dependency) and SHALL NOT load system fonts.

#### Scenario: Rendering uses the bundled fonts only
- Given the dev dependencies are installed
- When `npm run brand` runs
- Then every PNG under `brand/` SHALL be regenerated from its SVG
- And the renderer SHALL be configured with the Chivo font files and with
  system font loading disabled

### Requirement: Missing brand fonts fail the render

IF a Chivo font file is missing when `npm run brand` runs, THEN the renderer
SHALL exit non-zero and SHALL name the missing file.

#### Scenario: A missing font stops the render
- Given the Chivo dev dependencies are not installed
- When `npm run brand` runs
- Then the process SHALL exit non-zero
- And stderr SHALL name the missing font file
