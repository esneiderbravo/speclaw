# Validate

Run the `lawbook_validate` tool for the change and fix every issue it reports
(missing artifacts, non-normative specs, missing scenarios) before handing off
to implementation. Read its advisory **warnings** too: a near-duplicate
capability name usually means you should reuse the existing capability's exact
name, and a dropped-requirement warning means the delta should start from the
canonical. Warnings do not block, but resolve them unless the divergence is
intentional.

Next: read `steps/06-hand-off.md` and do only what it says.
