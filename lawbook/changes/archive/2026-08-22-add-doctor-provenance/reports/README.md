# Reports — add-doctor-provenance

Discipline reports `build` will fill (archive is blocked until at least one
exists):

| Report | Why |
| :-- | :-- |
| `backend.md` | Doctor/redact/index `indexed_at` / CLI handlers |
| `api.md` | MCP `doctor` tool output shape + CLI `--json` contract |
| `security.md` | Redaction defaults, egress inventory, publish OIDC / no long-lived token, no telemetry |
| `infra.md` | `publish.yml` hardening, issue templates, distribution docs |

Each report follows the build skill structure: header · gates table · tests
added · spec-scenario coverage · pre-existing failures · pending manual ·
verdict.
