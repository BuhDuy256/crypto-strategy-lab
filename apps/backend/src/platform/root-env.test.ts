// Verifies optional root environment loading without depending on a developer's .env.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFileIfPresent } from "./root-env.js";

const TEST_VARIABLE = "CRYPTO_LAB_ENV_LOADER_TEST";
const originalValue = process.env[TEST_VARIABLE];

afterEach(() => {
  if (originalValue === undefined) {
    delete process.env[TEST_VARIABLE];
  } else {
    process.env[TEST_VARIABLE] = originalValue;
  }
});

describe("loadEnvFileIfPresent", () => {
  it("loads values from an existing environment file", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "crypto-lab-env-"));
    const envPath = path.join(directory, ".env");
    writeFileSync(envPath, `${TEST_VARIABLE}=loaded-from-file\n`, "utf8");
    delete process.env[TEST_VARIABLE];

    try {
      expect(loadEnvFileIfPresent(envPath)).toBe(true);
      expect(process.env[TEST_VARIABLE]).toBe("loaded-from-file");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("returns false when the environment file does not exist", () => {
    const missingPath = path.join(tmpdir(), `missing-${Date.now()}`, ".env");

    expect(loadEnvFileIfPresent(missingPath)).toBe(false);
  });
});
