// Safety contract for the destructive test-database helper.

import { describe, expect, it, vi } from "vitest";
import { assertTestDatabaseGuard } from "./test-database.js";

const guardToken = "v5-certification-test-guard-token";

describe("assertTestDatabaseGuard", () => {
  it("fails closed before querying when the configured database is not a dedicated test database", async () => {
    const query = vi.fn();

    await expect(assertTestDatabaseGuard(
      { query } as never,
      "crypto_strategy_lab",
      guardToken
    )).rejects.toThrow("TEST_DATABASE_GUARD_DATABASE");

    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed when the database has no matching durable marker", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await expect(assertTestDatabaseGuard(
      { query } as never,
      "csl_test_v5_certification",
      guardToken
    )).rejects.toThrow("TEST_DATABASE_GUARD_UNVERIFIED");
  });

  it("accepts only the expected database and explicit marker token", async () => {
    const query = vi.fn(async () => ({
      rows: [{ database_name: "csl_test_v5_certification", guard_token: guardToken }]
    }));

    await expect(assertTestDatabaseGuard(
      { query } as never,
      "csl_test_v5_certification",
      guardToken
    )).resolves.toBeUndefined();
  });

  it("rejects a durable marker whose token or connected database differs", async () => {
    const query = vi.fn(async () => ({
      rows: [{ database_name: "csl_test_other", guard_token: "not-the-expected-token" }]
    }));

    await expect(assertTestDatabaseGuard(
      { query } as never,
      "csl_test_v5_certification",
      guardToken
    )).rejects.toThrow("TEST_DATABASE_GUARD_UNVERIFIED");
  });
});
