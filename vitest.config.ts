import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "integration/**/*.test.ts"
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Database-backed files reset the same dedicated test database. Keep files
    // sequential so two reset/migration cycles cannot race in PostgreSQL catalogs.
    fileParallelism: false,
    testTimeout: 300_000
  }
});
