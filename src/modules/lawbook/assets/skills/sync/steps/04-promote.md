# Promote

Run the `lawbook_sync` tool for the change. It copies each
`lawbook/changes/<name>/specs/<capability>/spec.md` over the canonical
`lawbook/specs/<capability>/spec.md` and reports what it promoted, flagging
each as **created** (new capability) or **updated** (overwrote an existing
one). A capability you expected to update showing up as *created* means the
delta forked a near-duplicate — fix the name before promoting.

Next: read `steps/05-report.md` and do only what it says.
