// Flat config (ESLint 10). Lint is a quality gate — see
// docs/standards/testing-standards.md. Formatting is Prettier's job;
// eslint-config-prettier turns off every rule that would fight it.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "dist-test/**", "node_modules/**", ".speclaw/**", "brand/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The whole repo runs on Node (CLI + build scripts), ESM.
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // A leading underscore marks an intentionally-unused binding
      // (e.g. `_flags` on a command handler that ignores its args).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // eslint-config-prettier must come last so it wins any rule conflicts.
  prettier,
);
