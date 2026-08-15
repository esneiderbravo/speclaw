# API checks — add-graph-law-engines (2026-08-14)

Date · Branch `feat/graph-law-engines` · Environment: local, `/Users/esneiderbravo/Projects/speclaw`, MCP registration + CLI transport.

This change adds one MCP tool surface, `law_verify`, and its CLI twin
`speclaw laws verify`. Both are transports over the same `verifyLaws` core; this
report covers the tool contract, the `VerifyReport` response shape, and how the
contract was exercised.

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Contract test | `npm test` → `test/contract/registers.test.ts` | ✅ `law_verify` registered on foundation; input schema rejects `engines: ["nope"]`, accepts `["deps","graph"]`; description ≤ 30 words |
| Format + lint | `npm run check` | ✅ 0 problems |
| Type-check | `npm run build` | ✅ `tsc` strict clean |

## The tool contract

**Tool:** `law_verify` (MCP, foundation module) · **CLI twin:** `speclaw laws verify`.

**Input schema** (Zod-validated at the transport boundary):

| Field | Type | Required | Meaning |
| :-- | :-- | :-- | :-- |
| `projectPath` | string | yes | Absolute path to the project |
| `paths` | string[] | no | Restrict to source files under these project-relative paths |
| `engines` | `("deps"\|"graph")[]` | no | Which batch engines to run; omit for all |
| `lawIds` | string[] | no | Restrict to these law ids |

Invalid input (e.g. `engines: ["ast"]`) is rejected by the schema before the
handler runs. The description is 21 words ("Verify the project's deterministic
laws (dependency and graph rules) and return violations by file. Run before
claiming an architecture task done."), under the 30-word token-budget ceiling —
asserted by a contract test.

**Response** — the `VerifyReport` object, returned as MCP text (pretty-printed
JSON) by the tool and as either a summary or `--json` by the CLI:

```
{
  schemaVersion: 1,
  summary: { evaluated, passed, failed, skipped, unknown },  // four disjoint terminal buckets
  findings: [ { lawId, severity, engine, file, line?, message, detail? } ],
  skipped:  [ { lawId, reason: "no-index" | "engine-error", detail? } ],
  unknown:  [ { lawId, detail } ],
  elapsedMs
}
```

Contract guarantees exercised:

- **Four-state summary, disjoint.** `passed + failed + skipped + unknown` equals
  the number of evaluated laws; no law appears in two buckets. Verified in
  `verify.test.ts` and in manual `--json` output (`{"evaluated":2,"passed":1,"failed":1,"skipped":0,"unknown":0}`).
- **Skips always carry a machine-readable reason.** A project with no index
  returns every batch law under `skipped` with `reason: "no-index"` and a
  remediation `detail` naming `compass_index` — never a silent pass.
- **Findings carry provenance.** Each `deps` finding carries the source `file`,
  the source `line`, and the destination in `detail`; each `graph` cycle finding
  carries the minimal cycle and the SCC size in `detail`.
- **Both transports agree.** The MCP tool and `speclaw laws verify` both delegate
  to `verifyLaws`, so they return equivalent reports (verified manually: identical
  summary and finding via the tool JSON and the CLI).

## Auth / permissions

None — speclaw is a 100%-local tool with no network surface or auth; `law_verify`
reads the local `.speclaw/index.db` and the committed manifest, and writes
nothing.

## How the contract was exercised

- **Contract test** (`registers.test.ts`): schema validation (accept/reject) and
  the description-length ceiling, via the stub MCP server (no live transport, no
  data store).
- **CLI** (isolated `mktemp -d` repo, removed after): `speclaw laws verify`,
  `speclaw laws verify --json`, and the no-index path — all against a throwaway
  index built by the real `speclaw index`, touching no real data.

## Pre-existing / unrelated failures

None in the API surface. (See `backend.md` for the one flaky, pre-existing
latency benchmark unrelated to this change.)

## Pending manual steps

None.

## Verdict

✅ `law_verify` and its CLI twin are registered, schema-validated, contract-tested,
and exercised end-to-end; the `VerifyReport` four-state contract holds and both
transports agree.
