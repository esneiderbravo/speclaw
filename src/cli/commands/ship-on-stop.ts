import { measureBranchDiff, shipOnStop, stopSummary } from "../../modules/lawbook/ship.js";

/**
 * `speclaw ship-on-stop`: the Claude Code `Stop` hook. Ships the branch's
 * change when the work changed since the last ship. Artifacts the change's
 * level still owes, or a failing gate, go to stderr with exit 2 so the agent
 * sees them and writes or fixes them — once: when the hook already blocked
 * this stop (`stop_hook_active`), it exits 0 so the agent can never loop.
 * Whatever happened, a ship prints one JSON line on stdout whose
 * `systemMessage` tells the user; a skipped stop prints nothing. Any other
 * failure exits 0.
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
    process.stdout.write(JSON.stringify({ systemMessage: stopSummary(r, block) }) + "\n");
    if (block && r.pending.length) {
      process.stderr.write(`speclaw: ${r.next.join("\n- ")}\n`);
      process.exit(2);
    }
    if (block) {
      const failed = r.gates[r.gates.length - 1];
      process.stderr.write(
        `speclaw: gate failed — ${failed.command} (exit ${failed.exitCode}). Fix it before finishing.\n${failed.tail}\n`,
      );
      process.exit(2);
    }
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
