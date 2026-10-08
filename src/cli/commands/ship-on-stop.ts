import { measureBranchDiff, shipOnStop, stopSummary } from "../../modules/lawbook/ship.js";

/**
 * `speclaw ship-on-stop`: the Claude Code `Stop` hook. Ships the branch's
 * change when the work changed since the last ship, and prints one JSON line
 * on stdout whose `systemMessage` tells the user what happened. Artifacts the
 * change's level still owes, or a failing gate, also set `decision: "block"`
 * with the `reason` the agent acts on — once: when the hook already blocked
 * this stop (`stop_hook_active`), it does not block again, so the agent can
 * never loop. A skipped stop prints nothing. It always exits 0.
 *
 * @param cwd - Project root (defaults to the process working directory).
 */
// Covers: req~ship-on-stop-hook~1
export async function runShipOnStop(cwd: string = process.cwd()): Promise<void> {
  const active = await stopHookActive();
  try {
    const out = shipOnStop(cwd);
    if (out.skipped !== null) return;
    const r = out.result;
    const block = !active && (r.pending.length > 0 || !r.gatesPassed);
    // Claude Code reads stdout JSON only on exit 0, so a blocked stop says
    // `decision: block` there too: the reason goes back to the agent and the
    // systemMessage reaches the user either way.
    const failed = r.gates[r.gates.length - 1];
    const reason = !block
      ? undefined
      : r.pending.length
        ? `speclaw: ${r.next.join("\n- ")}`
        : `speclaw: gate failed — ${failed.command} (exit ${failed.exitCode}). Fix it before finishing.\n${failed.tail}`;
    process.stdout.write(
      JSON.stringify({
        ...(reason ? { decision: "block", reason } : {}),
        systemMessage: stopSummary(r, block),
      }) + "\n",
    );
  } catch {
    // A hook must never break the session.
  }
}

/**
 * `speclaw measure-diff`: the edit hook's detached background job. Measures the
 * branch diff's ceremony level into `.speclaw/level-cache.json` so the next
 * hook call and the stop reuse it. Silent and fail-safe.
 *
 * @param cwd - Project root (defaults to the process working directory).
 */
export async function runMeasureDiff(cwd: string = process.cwd()): Promise<void> {
  try {
    measureBranchDiff(cwd);
  } catch {
    // A background job must never surface anywhere.
  }
}

/** Whether this stop was already blocked by the hook once (`stop_hook_active`). */
async function stopHookActive(): Promise<boolean> {
  try {
    const raw = process.stdin.isTTY ? "" : await readStdin();
    return raw
      ? Boolean((JSON.parse(raw) as { stop_hook_active?: boolean }).stop_hook_active)
      : false;
  } catch {
    return false;
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 1000).unref();
  });
}
