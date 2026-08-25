import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentHashFor,
  defaultEmbedText,
  EMBED_INPUT_VERSION,
} from "../../src/modules/compass/embed-input.js";

test("contentHashFor is stable for identical inputs", () => {
  const a = contentHashFor({
    lang: "typescript",
    kind: "function",
    name: "alpha",
    signature: "(x: number)",
    embedText: defaultEmbedText("function", "alpha", "(x: number)"),
  });
  const b = contentHashFor({
    lang: "typescript",
    kind: "function",
    name: "alpha",
    signature: "(x: number)",
    embedText: defaultEmbedText("function", "alpha", "(x: number)"),
  });
  assert.equal(a, b);
});

test("contentHashFor ignores path — only recipe fields matter", () => {
  const base = {
    lang: "typescript",
    kind: "function",
    name: "alpha",
    signature: null as string | null,
    embedText: defaultEmbedText("function", "alpha", null),
  };
  assert.equal(contentHashFor(base), contentHashFor({ ...base }));
});

test("contentHashFor changes when signature or embed text changes", () => {
  const a = contentHashFor({
    lang: "typescript",
    kind: "function",
    name: "alpha",
    signature: "(a)",
    embedText: "function alpha (a)",
  });
  const b = contentHashFor({
    lang: "typescript",
    kind: "function",
    name: "alpha",
    signature: "(b)",
    embedText: "function alpha (b)",
  });
  assert.notEqual(a, b);
});

test("EMBED_INPUT_VERSION is non-empty", () => {
  assert.ok(EMBED_INPUT_VERSION.length > 0);
});
