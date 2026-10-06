# Reports — sync-site-theme

Add at least one discipline report before archive.

Expected disciplines:

- `brand.md`: covers the brand SVGs, the regenerated PNGs, `scripts/render-brand.mjs`, and the Chivo fonts.
- `cli.md`: covers the truecolor palette in `src/cli/lib/ui.ts` and the branded header.
- `frontend.md`: covers the Compass viewer HTML in `src/modules/compass/visualize.ts`.

The change touches no API surface, so no `api.md` is owed. The reviewer writes `review.md`. Each report follows the structure in `ai-specs/rules/spec-reports-disciplines.md` §3.
