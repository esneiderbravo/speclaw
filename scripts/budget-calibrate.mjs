#!/usr/bin/env node
/**
 * Optional calibration of speclaw/estimate-v1 against Anthropic's token-count
 * API. Never used in CI. Requires ANTHROPIC_API_KEY.
 *
 * Usage: node scripts/budget-calibrate.mjs [file...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Same estimator as src/shared/tokens.ts (keep in sync manually). */
function estimateTokens(text) {
  if (text.length === 0) return 0;
  const chunks = text.match(/[A-Za-z]+|\d+|\s+|[^\sA-Za-z\d]/g) ?? [];
  let total = 0;
  for (const c of chunks) {
    if (/^[A-Za-z]+$/.test(c)) total += Math.ceil(c.length / 4.1);
    else if (/^\d+$/.test(c)) total += Math.ceil(c.length / 2.5);
    else if (/^\s+$/.test(c)) total += c.includes("\n") ? 1 : 0;
    else total += 1;
  }
  return total;
}

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("ANTHROPIC_API_KEY is required for --exact calibration.");
  process.exit(2);
}

const files = process.argv.slice(2);
const targets =
  files.length > 0
    ? files
    : ["CLAUDE.md", "AGENTS.md", "LAWS.md", "docs/compass.md"].map((f) => path.join(root, f));

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.warn(`skip missing ${file}`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  const estimated = estimateTokens(text);
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) {
    console.error(`API error for ${file}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = await res.json();
  const exact = body.input_tokens ?? body.token_count;
  const delta = exact ? ((estimated - exact) / exact) * 100 : NaN;
  console.log(
    `${path.relative(root, file)}  estimate=${estimated}  exact=${exact}  delta=${delta.toFixed(1)}%`,
  );
}
