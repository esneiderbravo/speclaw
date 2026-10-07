#!/usr/bin/env bash
# Workflow benchmark: the same one-line bug fixed by a real agent (`claude -p`)
# in three modes, each in a throwaway git fixture under /tmp.
#   A — agent alone, no speclaw
#   B — Cortex as installed by `speclaw init` (Stop hook ships)
#   C — agent + an explicit `speclaw ship` call
# Usage: scripts/bench-workflow.sh [runs-per-mode=3] [modes=AC]
set -euo pipefail
RUNS=${1:-3}
MODES=${2:-AB}
SPECLAW="node $(cd "$(dirname "$0")/.." && pwd)/dist/cli/index.js"
OUT=$(mktemp -d /tmp/speclaw-bench-XXXX)
# Hooks resolve `speclaw` on PATH: point it at this checkout's build.
mkdir -p "$OUT/bin"
printf '#!/bin/sh\nexec %s "$@"\n' "$SPECLAW" > "$OUT/bin/speclaw" && chmod +x "$OUT/bin/speclaw"
export PATH="$OUT/bin:$PATH"

fixture() {
  local d; d=$(mktemp -d "$OUT/$1-XXXX")
  (cd "$d" && git init -q -b main
   printf '{"name":"demo","type":"module","scripts":{"test":"node --test"}}\n' > package.json
   printf 'export function applyDiscount(price, pct) {\n  return price - price * pct;\n}\n' > price.js
   printf 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { applyDiscount } from "./price.js";\ntest("10%% off 200 is 180", () => assert.equal(applyDiscount(200, 10), 180));\n' > price.test.js
   if [ "$1" = B ]; then
     $SPECLAW init --minimal >/dev/null
     printf '{"mcpServers":{"speclaw":{"type":"stdio","command":"node","args":["%s","mcp"]}}}\n' "${SPECLAW#node }" > .mcp.json
   else
     $SPECLAW lawbook init >/dev/null
   fi
   git add -A && git commit -qm init && git checkout -qb fix/discount
   [ "$1" = B ] && $SPECLAW index >/dev/null 2>&1 || true)
  echo "$d"
}

TASK="The test in this repo fails. Fix the bug in the source (not the test) and make npm test pass. Do not ask questions."
prompt() {
  case $1 in
    A) echo "$TASK" ;;
    B) echo "$TASK" ;;
    C) echo "$TASK When the tests pass, run exactly: $SPECLAW ship fix-discount --summary \"applyDiscount treats pct as a percentage\"" ;;
  esac
}

for m in $(echo "$MODES" | fold -w1); do
  for i in $(seq 1 "$RUNS"); do
    d=$(fixture "$m")
    extra=(); [ "$m" = B ] && extra=(--mcp-config .mcp.json)
    (cd "$d" && claude -p "$(prompt "$m")" --output-format json "${extra[@]}" \
      --allowedTools "Read,Edit,Write,Bash,Glob,Grep,Agent,Skill,mcp__speclaw" > "$OUT/$m-$i.json" 2>/dev/null || true
     fixed=$(git diff --quiet HEAD -- price.js && echo no || echo yes)
     pass=$(npm test >/dev/null 2>&1 && echo yes || echo no)
     archived=$(ls lawbook/changes/archive 2>/dev/null | wc -l | tr -d ' ')
     echo "$fixed $pass $archived" > "$OUT/$m-$i.chk")
  done
done

python3 - "$OUT" "$MODES" "$RUNS" <<'PY'
import json, statistics as st, sys
out, modes, runs = sys.argv[1], sys.argv[2], int(sys.argv[3])
print("| Mode | Wall (s) per run | Median | Cost median | Fixed | Tests pass | Archived |")
print("|---|---|---|---|---|---|---|")
for m in modes:
    w, c, chk = [], [], []
    for i in range(1, runs + 1):
        try:
            d = json.load(open(f"{out}/{m}-{i}.json")); w.append(d["duration_ms"] / 1000); c.append(d.get("total_cost_usd", 0))
        except Exception:
            pass
        chk.append(open(f"{out}/{m}-{i}.chk").read().split())
    print(f"| {m} | {' / '.join(f'{x:.1f}' for x in w)} | {st.median(w):.1f} | ${st.median(c):.3f} | "
          f"{sum(x[0]=='yes' for x in chk)}/{runs} | {sum(x[1]=='yes' for x in chk)}/{runs} | {sum(int(x[2])>0 for x in chk)}/{runs} |")
print(f"\nraw results: {out}")
PY
