import { write } from "./env.js";
import type { Profile } from "../../src/modules/foundation/scaffold.js";

// Small, deterministic source samples with a known call graph, used by the
// Compass integration tests. The call chain is alpha -> beta -> gamma, alpha
// also calls helper (imported), Widget.render calls alpha; Python's
// Calculator.run calls compute. These relationships let explore/impact/trace
// assert on real edges.

export const SAMPLE_UTIL_TS = `export function helper(): number {
  return 42;
}
`;

export const SAMPLE_MAIN_TS = `import { helper } from "./util.js";

export function gamma(x: number): number {
  return x + 1;
}

export function beta(x: number): number {
  return gamma(x);
}

export function alpha(x: number): number {
  return beta(x) + helper();
}

export class Widget {
  render(): string {
    return alpha(1).toString();
  }
}

export interface Shape {
  size: number;
}

export type Id = string;
`;

export const SAMPLE_PY = `def compute(a):
    return a * 2


class Calculator:
    def run(self, x):
        return compute(x)
`;

export const SAMPLE_JS = `function greet(name) {
  return "hi " + name;
}

module.exports = { greet };
`;

/**
 * Write the multi-language sample sources into a project root so `buildIndex`
 * has a known graph to parse.
 *
 * @param root - Project directory to seed.
 * @returns The relative paths written.
 */
export function seedSampleRepo(root: string): string[] {
  write(root, "src/util.ts", SAMPLE_UTIL_TS);
  write(root, "src/main.ts", SAMPLE_MAIN_TS);
  write(root, "src/calc.py", SAMPLE_PY);
  write(root, "src/greet.js", SAMPLE_JS);
  // A file under a skipped directory — the walker must ignore it.
  write(root, "node_modules/pkg/ignored.ts", "export function ignored(): void {}\n");
  return ["src/util.ts", "src/main.ts", "src/calc.py", "src/greet.js"];
}

/** A minimal-but-complete profile for scaffold tests. */
export function sampleProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    project_name: "demo",
    project_description: "A demo project",
    stack_summary: "TypeScript on Node",
    test_commands: "npm test",
    lint_commands: "npm run check",
    branch_pattern: "feat/<slug>",
    ...overrides,
  };
}
