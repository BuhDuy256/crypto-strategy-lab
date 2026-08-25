import { describe, expect, it } from "vitest";
import { loadConfig, type EnvSource } from "./config.js";

const VALID_ENV: EnvSource = {
  POSTGRES_HOST: "localhost",
  POSTGRES_PORT: "5432",
  POSTGRES_USER: "crypto_strategy_lab",
  POSTGRES_PASSWORD: "local-dev-password",
  POSTGRES_DB: "crypto_strategy_lab"
};

describe("loadConfig", () => {
  it("loads a typed config when all required variables are present", () => {
    const config = loadConfig({ ...VALID_ENV });

    expect(config).toEqual({
      postgres: {
        host: "localhost",
        port: 5432,
        user: "crypto_strategy_lab",
        password: "local-dev-password",
        database: "crypto_strategy_lab"
      },
      backtestRunner: { concurrency: 1 },
      leaderboard: { topK: 10 }
    });
  });

  it("throws a clear error naming the missing variable", () => {
    const envWithoutPassword = { ...VALID_ENV };
    delete envWithoutPassword.POSTGRES_PASSWORD;

    expect(() => loadConfig(envWithoutPassword)).toThrow(/POSTGRES_PASSWORD/);
  });

  it("throws a clear error when a variable is set but blank", () => {
    expect(() => loadConfig({ ...VALID_ENV, POSTGRES_USER: "   " })).toThrow(/POSTGRES_USER/);
  });

  it("throws a clear error when the port is not a valid number", () => {
    expect(() => loadConfig({ ...VALID_ENV, POSTGRES_PORT: "not-a-number" })).toThrow(
      /POSTGRES_PORT/
    );
  });

  it("throws a clear error when the port is out of range", () => {
    expect(() => loadConfig({ ...VALID_ENV, POSTGRES_PORT: "70000" })).toThrow(/POSTGRES_PORT/);
  });

  it("loads and validates runner concurrency", () => {
    expect(loadConfig({ ...VALID_ENV, BACKTEST_RUNNER_CONCURRENCY: "2" }).backtestRunner)
      .toEqual({ concurrency: 2 });
    expect(() => loadConfig({ ...VALID_ENV, BACKTEST_RUNNER_CONCURRENCY: "0" }))
      .toThrow(/BACKTEST_RUNNER_CONCURRENCY/);
  });

  it("loads and validates the leaderboard size", () => {
    expect(loadConfig({ ...VALID_ENV, LEADERBOARD_TOP_K: "25" }).leaderboard)
      .toEqual({ topK: 25 });
    expect(() => loadConfig({ ...VALID_ENV, LEADERBOARD_TOP_K: "0" }))
      .toThrow(/LEADERBOARD_TOP_K/);
  });
});
