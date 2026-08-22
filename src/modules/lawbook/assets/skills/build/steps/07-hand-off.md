# Hand off

When every task is checked and gates are green, tell the user the change is
ready to `sync` and `archive`. Keep the delta specs current as you build, but
know that `sync` formally reconciles the delta specs against what was actually
built — so behavior that drifted past the original spec is caught there, not
left to chance.

No further steps remain — build workflow complete.
