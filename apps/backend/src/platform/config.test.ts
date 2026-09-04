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
      leaderboard: { topK: 10 },
      redis: { url: "redis://localhost:6379" },
      websocket: { maxOutboundMessages: 32, maxSubscriptionsPerClient: 32 },
      marketIngest: {
        symbol: "BTCUSDT",
        timeframes: ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"],
        streamBaseUrl: "wss://data-stream.binance.vision"
      },
      news: {
        coinDeskRss: {
          feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
          pollIntervalMs: 900000,
          requestTimeoutMs: 10000,
          retryCount: 2,
          retryDelayMs: 1000
        },
        sentimentAnalysis: {
          leaseSeconds: 60,
          maxAttempts: 3,
          batchSize: 10,
          pollIntervalMs: 60000
        }
      }
    });
  });

  it("reads the ingest stream set from the environment", () => {
    const config = loadConfig({
      ...VALID_ENV,
      MARKET_INGEST_SYMBOL: "BTCUSDT",
      MARKET_INGEST_TIMEFRAMES: " 1m , 5m ",
      BINANCE_STREAM_URL: "ws://127.0.0.1:9001"
    });

    expect(config.marketIngest).toEqual({
      symbol: "BTCUSDT",
      timeframes: ["1m", "5m"],
      streamBaseUrl: "ws://127.0.0.1:9001"
    });
  });

  it("rejects an ingest stream set that names no timeframe", () => {
    expect(() => loadConfig({ ...VALID_ENV, MARKET_INGEST_TIMEFRAMES: " , " })).toThrow(
      /MARKET_INGEST_TIMEFRAMES/
    );
  });

  it("rejects a stream URL that is not a WebSocket URL", () => {
    expect(() => loadConfig({ ...VALID_ENV, BINANCE_STREAM_URL: "https://example.com" })).toThrow(
      /BINANCE_STREAM_URL/
    );
  });

  it("loads a conservative configurable CoinDesk RSS collection policy", () => {
    const config = loadConfig({
      ...VALID_ENV,
      NEWS_COINDESK_RSS_URL: "https://rss.example.test/news",
      NEWS_POLL_INTERVAL_MS: "120000",
      NEWS_REQUEST_TIMEOUT_MS: "5000",
      NEWS_RETRY_COUNT: "1",
      NEWS_RETRY_DELAY_MS: "250"
    });

    expect(config.news.coinDeskRss).toEqual({
      feedUrl: "https://rss.example.test/news",
      pollIntervalMs: 120000,
      requestTimeoutMs: 5000,
      retryCount: 1,
      retryDelayMs: 250
    });
    expect(() => loadConfig({ ...VALID_ENV, NEWS_COINDESK_RSS_URL: "http://rss.example.test" }))
      .toThrow(/NEWS_COINDESK_RSS_URL/);
    expect(() => loadConfig({ ...VALID_ENV, NEWS_POLL_INTERVAL_MS: "59999" }))
      .toThrow(/NEWS_POLL_INTERVAL_MS/);
  });

  it("loads and bounds the configurable sentiment analysis lifecycle policy", () => {
    const config = loadConfig({
      ...VALID_ENV,
      NEWS_ANALYSIS_LEASE_SECONDS: "45",
      NEWS_ANALYSIS_MAX_ATTEMPTS: "4",
      NEWS_ANALYSIS_BATCH_SIZE: "25",
      NEWS_ANALYSIS_POLL_INTERVAL_MS: "90000"
    });

    expect(config.news.sentimentAnalysis).toEqual({
      leaseSeconds: 45,
      maxAttempts: 4,
      batchSize: 25,
      pollIntervalMs: 90000
    });
    expect(() => loadConfig({ ...VALID_ENV, NEWS_ANALYSIS_LEASE_SECONDS: "4" }))
      .toThrow(/NEWS_ANALYSIS_LEASE_SECONDS/);
    expect(() => loadConfig({ ...VALID_ENV, NEWS_ANALYSIS_MAX_ATTEMPTS: "0" }))
      .toThrow(/NEWS_ANALYSIS_MAX_ATTEMPTS/);
    expect(() => loadConfig({ ...VALID_ENV, NEWS_ANALYSIS_BATCH_SIZE: "0" }))
      .toThrow(/NEWS_ANALYSIS_BATCH_SIZE/);
    expect(() => loadConfig({ ...VALID_ENV, NEWS_ANALYSIS_POLL_INTERVAL_MS: "4999" }))
      .toThrow(/NEWS_ANALYSIS_POLL_INTERVAL_MS/);
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

  it("validates Redis and outbound buffer configuration", () => {
    expect(loadConfig({ ...VALID_ENV, REDIS_URL: "redis://redis:6379" }).redis)
      .toEqual({ url: "redis://redis:6379" });
    expect(() => loadConfig({ ...VALID_ENV, REDIS_URL: "http://redis" })).toThrow(/REDIS_URL/);
    expect(() => loadConfig({ ...VALID_ENV, WS_OUTBOUND_BUFFER_MAX: "0" }))
      .toThrow(/WS_OUTBOUND_BUFFER_MAX/);
    expect(() => loadConfig({ ...VALID_ENV, WS_SUBSCRIPTION_MAX: "0" }))
      .toThrow(/WS_SUBSCRIPTION_MAX/);
  });
});
