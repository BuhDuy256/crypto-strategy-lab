// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      // The scratch area is a developer's own working directory, already kept
      // out of the repository. Linting it makes the gate fail on throwaway
      // probe scripts that were never meant to meet repository rules.
      ".scratch/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "error"
    }
  },
  {
    // Plain-JavaScript repository tooling. TypeScript files get their Node
    // globals from @types/node; these do not, so declare the few they use.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" }
    }
  }
);
