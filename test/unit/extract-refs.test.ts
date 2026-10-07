// Covers: req~type-ref-edges~1
import { test } from "node:test";
import assert from "node:assert/strict";
import { extract, type ExtractedRef } from "../../src/modules/compass/extract.js";
import { langForPath } from "../../src/modules/compass/languages.js";

async function refsOf(
  file: string,
  source: string,
): Promise<{ refs: ExtractedRef[]; owners: string[] }> {
  const ex = await extract(source, langForPath(file)!);
  const refs = ex.refs.filter((r) => r.kind === "ref");
  return {
    refs,
    owners: refs.map((r) => (r.ownerIndex === null ? "<file>" : ex.symbols[r.ownerIndex]!.name)),
  };
}

const summary = (refs: ExtractedRef[], owners: string[]) =>
  refs.map((r, i) => `${owners[i]}:${r.name}:${r.member}:${r.spec ?? "-"}`).sort();

test("TS annotations, generics, and heritage clauses become ref edges", async () => {
  const { refs, owners } = await refsOf(
    "src/a.ts",
    `import type { Props, Base } from "./types.js";
import * as ns from "./ns.js";
export interface Row extends Props, ns.Shape<Cell> { cell: Cell }
export class W extends Base<Item> implements Props, ns.Marker {
  items: Map<string, Item[]> = new Map();
}
export function f<T>(a: T, b: Promise<Props>, c: deep.path.Thing): Result | null {
  return null;
}
export const top: Props = { id: "x" } as never;
`,
  );
  assert.deepEqual(summary(refs, owners), [
    "<file>:Props:0:./types.js",
    "Row:Cell:0:-",
    "Row:Props:0:./types.js",
    "Row:Shape:2:./ns.js",
    "W:Base:0:./types.js",
    "W:Item:0:-",
    "W:Marker:2:./ns.js",
    "W:Props:0:./types.js",
    "f:Props:0:./types.js",
    "f:Result:0:-",
    "f:Thing:1:-",
  ]);
});

test("JS class heritage is a ref; other qualifiers are foreign", async () => {
  const { refs, owners } = await refsOf(
    "src/a.js",
    `import { Base } from "./base.js";
class A extends Base {}
class B extends lib.Thing {}
`,
  );
  assert.deepEqual(summary(refs, owners), ["A:Base:0:./base.js", "B:Thing:1:-"]);
});

test("Python emits no ref edges", async () => {
  const { refs } = await refsOf("src/a.py", "def f(a: int) -> str:\n    return str(a)\n");
  assert.deepEqual(refs, []);
});

// Covers: req~type-ref-edges~1
test("a type parameter shadows a name only inside its own declaration", async () => {
  const { refs, owners } = await refsOf(
    "src/a.tsx",
    `import type { Props } from "./types.js";
export function generic<Props>(p: Props): Props {
  const inner = (q: Props): void => void q;
  return p;
}
export function Widget(p: Props): Props {
  return p;
}
export const top: Props = { id: "x" } as never;
`,
  );
  // Inside `generic` (and the arrow nested in it) Props is the parameter: no ref.
  assert.deepEqual(summary(refs, owners), [
    "<file>:Props:0:./types.js",
    "Widget:Props:0:./types.js",
  ]);
});

// Covers: req~type-ref-edges~1
test("a same-file interface keeps its refs outside a same-named type parameter", async () => {
  const { refs, owners } = await refsOf(
    "src/b.ts",
    `interface Props { id: string }
export class Box<Props> { value!: Props }
export function render(p: Props): void { void p; }
`,
  );
  assert.deepEqual(summary(refs, owners), ["render:Props:0:-"]);
});
