# stop-hook-feedback

## Why

A level-3 feature built under the Stop hook in a NestJS/Next.js monorepo
(FAR-1387, 70 files, 27 min) showed five gaps:

- The level was told only at the stop, after 25 minutes of work. Measuring that
  diff takes ~20 s, the cache matched only the exact file set, and the agent
  added files faster than a measurement landed — so the edit hook never spoke,
  and each new file set started another concurrent background measurement.
- Three new HTTP endpoints measured "no public API": the signal looked only at
  `package.json` `main`/`bin` plus speclaw's own `src/cli/index.ts` and
  `src/server.ts`, hardcoded for every project. The Compass map printed the same
  speclaw entries (`entry: src/server.ts (mcp) · …`) in every repo.
- The spec lane's law asks for one report per discipline and a mandatory
  `api.md` for API changes; ship wrote one lumped `change.md` and nothing asked
  for `api.md`.
- A stop whose gates passed was silent: the hook discards stdout, so the user
  could not tell whether it was still running or what was left.

## What changes

- The edit hook tells a grown diff from its last measurement (a floor for the
  level) and keeps one background measurement in flight at a time.
- The diff's added and removed lines are read for route declarations (NestJS,
  Spring, FastAPI/Flask, Express-style routers, Go, Next.js route handlers),
  DTO code and contract files (OpenAPI, proto, GraphQL). Any hit counts as a
  public API and, at level 1+, owes `reports/api.md` naming the files.
- Entry points come from the project's own `package.json`, for the level signal
  and the map; a workspace root names none.
- At level 2+, tests spanning several packages run one gate per package and
  ship writes one report per discipline (`backend.md`, `frontend.md`,
  `e2e.md`…), removing the lumped report it wrote earlier.
- The Stop hook prints a `systemMessage`: gates with times, then the archive or
  what is left.

## Impact

- Capability `ship`: new requirements (grown diff, API report, entry points,
  per-discipline reports, stop summary); two requirements reworded.
- Modules: `lawbook` (`ship.ts`, `levels.ts`, new `api-surface.ts`), `compass`
  (`map.ts`), `foundation` (`hooks.ts`: the Stop command keeps stdout), `cli`
  (`ship-on-stop`), `shared` (new `package-entries.ts`).
- Installed projects pick up the new Stop command when their hooks are
  reinstalled (`speclaw update`); until then the summary is discarded and
  everything else works.
