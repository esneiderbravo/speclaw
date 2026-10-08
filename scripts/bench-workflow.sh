#!/usr/bin/env bash
# Workflow benchmark: the same one-line bug fixed by a real agent (`claude -p`)
# in three modes, each in a throwaway git fixture under /tmp.
#   A — agent alone, no speclaw
#   B — Cortex as installed by `speclaw init` (Stop hook ships)
#   C — agent + an explicit `speclaw ship` call
# Scenarios (sources from scripts/bench-fixture.mjs, sized per ceremony level):
#   one — level 0 · multi — level 1 · api — level 2 · wide — level 3 ·
#   deep — a level-0 bug five calls deep in a 130-file repo (code-graph case)
# SPECLAW_DIST points at another build (e.g. a main worktree's dist/).
# Usage: scripts/bench-workflow.sh [runs-per-mode=3] [modes=AB] [scenario=one]
set -euo pipefail
RUNS=${1:-3}
MODES=${2:-AB}
SCENARIO=${3:-one}
FIXTURE="$(cd "$(dirname "$0")" && pwd)/bench-fixture.mjs"
SPECLAW="node ${SPECLAW_DIST:-$(cd "$(dirname "$0")/.." && pwd)/dist}/cli/index.js"
OUT=$(mktemp -d /tmp/speclaw-bench-XXXX)
# Hooks resolve `speclaw` on PATH: point it at this checkout's build.
mkdir -p "$OUT/bin"
printf '#!/bin/sh\nexec %s "$@"\n' "$SPECLAW" > "$OUT/bin/speclaw" && chmod +x "$OUT/bin/speclaw"
export PATH="$OUT/bin:$PATH"

fixture() {
  local d; d=$(mktemp -d "$OUT/$1-XXXX")
  (cd "$d" && git init -q -b main
   node "$FIXTURE" "$SCENARIO"
   if [ "$1" = B ]; then
     $SPECLAW init --minimal >/dev/null
     # init configures no IDE folder; the Stop hook lives in .claude/settings.json.
     $SPECLAW agent add claude >/dev/null
     printf '{"mcpServers":{"speclaw":{"type":"stdio","command":"node","args":["%s","mcp"]}}}\n' "${SPECLAW#node }" > .mcp.json
   else
     $SPECLAW lawbook init >/dev/null
   fi
   git add -A && git commit -qm init && git checkout -qb fix/discount
   [ "$1" = B ] && $SPECLAW index >/dev/null 2>&1 || true)
  echo "$d"
}

TASK="The tests in this repo fail. Fix the bugs in the source (not the tests) and make npm test pass. Do not ask questions."
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
    t0=$(node -e 'console.log(Date.now())')
    (cd "$d" && claude -p "$(prompt "$m")" --output-format json ${extra[@]+"${extra[@]}"} \
      --allowedTools "Read,Edit,Write,Bash,Glob,Grep,Agent,Skill,mcp__speclaw" > "$OUT/$m-$i.json" 2>/dev/null || true
     fixed=$(git diff --quiet main -- '*.js' ':!*test*' && echo no || echo yes)
     pass=$(npm test >/dev/null 2>&1 && echo yes || echo no)
     archived=$(ls lawbook/changes/archive 2>/dev/null | wc -l | tr -d ' ' || true)
     # Documented: a tasks.md or record.md whose why is written, in flight or archived.
     documented=$(grep -L -r "2–5 lines: what and why" --include=record.md --include=tasks.md lawbook/changes 2>/dev/null | wc -l | tr -d ' ' || true)
     level=$(python3 -c 'import glob,json; f=sorted(glob.glob("lawbook/changes/**/change.json", recursive=True)); print(json.load(open(f[0])).get("confirmedLevel","-") if f else "-")' || echo -)
     wall=$(node -e "console.log(((Date.now() - $t0) / 1000).toFixed(1))")
     # What the run left behind: speclaw's change artifacts, then the source edits.
     { find lawbook/changes -type f ! -name README.md 2>/dev/null | sed 's#^lawbook/changes/##' | sort
       git status --porcelain --untracked-files=all -- . ':!lawbook' ':!.speclaw' | sort; } > "$OUT/$m-$i.files"
     echo "$fixed $pass $archived $documented $level $wall" > "$OUT/$m-$i.chk")
  done
done

python3 - "$OUT" "$MODES" "$RUNS" <<'PY'
import glob, json, os, re, statistics as st, sys
out, modes, runs = sys.argv[1], sys.argv[2], int(sys.argv[3])
SHELL_READ = re.compile(r"(^|[;&|]\s*)(cat|head|tail|sed|less|nl|awk|grep|egrep|rg|ag|find)\b")

def tools(session):
    """Tool calls in a run's transcript: speclaw MCP by name, code reads, and the rest."""
    mcp, reads, other = {}, 0, 0
    for f in glob.glob(os.path.expanduser(f"~/.claude/projects/*/{session}.jsonl")):
        for line in open(f):
            try:
                e = json.loads(line)
            except Exception:
                continue
            content = (e.get("message") or {}).get("content")
            if e.get("type") != "assistant" or not isinstance(content, list):
                continue
            for b in content:
                if b.get("type") != "tool_use":
                    continue
                n = b["name"]
                if n.startswith("mcp__speclaw__"):
                    k = n[len("mcp__speclaw__"):]
                    mcp[k] = mcp.get(k, 0) + 1
                elif n in ("Read", "Grep", "Glob") or (n == "Bash" and SHELL_READ.search(b["input"].get("command", ""))):
                    reads += 1
                else:
                    other += 1
    return mcp, reads, other

print("| Mode | Agent s (median) | Process s | Cost | Tokens (in+cache+out) | Turns | Fixed | Pass | Archived | Documented | Level | speclaw MCP calls | Code reads | Other tools |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for m in modes:
    w, c, tok, turns, chk, mcps, reads, others = [], [], [], [], [], {}, [], []
    for i in range(1, runs + 1):
        try:
            d = json.load(open(f"{out}/{m}-{i}.json"))
            w.append(d["duration_ms"] / 1000); c.append(d.get("total_cost_usd", 0)); turns.append(d.get("num_turns", 0))
            u = d.get("usage", {})
            tok.append(sum(u.get(k, 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")))
            mc, r, o = tools(d.get("session_id", ""))
            for k, v in mc.items():
                mcps[k] = mcps.get(k, 0) + v
            reads.append(r); others.append(o)
        except Exception:
            pass
        chk.append(open(f"{out}/{m}-{i}.chk").read().split())
    mcp_s = ", ".join(f"{k}×{v}" for k, v in sorted(mcps.items())) or "—"
    print(f"| {m} | {st.median(w):.1f} | {st.median(float(x[5]) for x in chk):.1f} | ${st.median(c):.3f} | {st.median(tok):,.0f} | {st.median(turns)} | "
          f"{sum(x[0]=='yes' for x in chk)}/{runs} | {sum(x[1]=='yes' for x in chk)}/{runs} | {sum(int(x[2])>0 for x in chk)}/{runs} | "
          f"{sum(int(x[3])>0 for x in chk)}/{runs} | {' '.join(sorted(set(x[4] for x in chk)))} | {mcp_s} (all runs) | {st.median(reads)} | {st.median(others)} |")
print(f"\nraw results: {out}")
PY
