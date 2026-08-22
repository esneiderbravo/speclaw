import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { estimateTokens } from "../../src/shared/tokens.js";
import { loadDeclaredBudget } from "../../src/shared/exposure.js";

const SKILLS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/lawbook/assets/skills",
);

function skillDirs(): string[] {
  return fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

test("each skill dispatcher stays under the dispatcher budget and points only at step 01", () => {
  const cap = loadDeclaredBudget().dispatcher;
  for (const name of skillDirs()) {
    const skillMd = path.join(SKILLS, name, "SKILL.md");
    const body = fs.readFileSync(skillMd, "utf8");
    const tokens = estimateTokens(body);
    assert.ok(tokens <= cap, `${name} dispatcher is ${tokens} tokens (cap ${cap})`);
    assert.match(body, /steps\/01-/);
    assert.doesNotMatch(body, /steps\/0[2-9]-/);
  }
});

test("each step names exactly one successor; last declares the end; no +2 foresight", () => {
  for (const name of skillDirs()) {
    const stepsDir = path.join(SKILLS, name, "steps");
    assert.ok(fs.existsSync(stepsDir), `${name} missing steps/`);
    const steps = fs
      .readdirSync(stepsDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    assert.ok(steps.length >= 2, `${name} needs at least two steps`);
    for (let i = 0; i < steps.length; i++) {
      const body = fs.readFileSync(path.join(stepsDir, steps[i]!), "utf8");
      const refs = [...body.matchAll(/steps\/(\d{2}-[a-z0-9-]+\.md)/gi)].map((m) => m[1]!);
      if (i < steps.length - 1) {
        assert.equal(refs.length, 1, `${name}/${steps[i]} should name exactly one successor`);
        assert.equal(refs[0], steps[i + 1], `${name}/${steps[i]} should point at next step`);
      } else {
        assert.equal(refs.length, 0, `${name}/${steps[i]} must not name further steps`);
        assert.match(
          body,
          /no further steps|workflow complete|no more steps/i,
          `${name}/${steps[i]} must declare the end`,
        );
      }
      // No foresight beyond +1
      for (let j = i + 2; j < steps.length; j++) {
        assert.ok(!body.includes(steps[j]!), `${name}/${steps[i]} must not mention ${steps[j]}`);
      }
    }
  }
});
