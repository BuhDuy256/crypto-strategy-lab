// Typed configuration loader for the backend.
//
// Reads and validates the environment variables the system needs at
// startup (see .env.example for the full list and safe placeholders).
// A missing or malformed variable throws a clear error immediately,
// instead of letting an undefined value reach the rest of the app.

/** Source of environment values. Matches the shape of `process.env`. */
export type EnvSource = Record<string, string | undefined>;

export interface PostgresConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

export interface AppConfig {
  readonly postgres: PostgresConfig;
  readonly backtestRunner: { readonly concurrency: number };
  // Fixed Top-K size of every leaderboard projection. A project-wide value, not a
  // per-experiment field, so a rebuild always uses the same K.
  readonly leaderboard: { readonly topK: number };
  readonly redis: { readonly url: string };
  readonly websocket: {
    readonly maxOutboundMessages: number;
    readonly maxSubscriptionsPerClient: number;
  };
  // Which live streams the market ingest process holds open. One symbol and a
  // timeframe list, because a Binance connection carries many streams at once.
  readonly marketIngest: {
    readonly symbol: string;
    readonly timeframes: readonly string[];
    readonly streamBaseUrl: string;
  };
  readonly news: {
    readonly coinDeskRss: {
      readonly feedUrl: string;
      readonly pollIntervalMs: number;
      readonly requestTimeoutMs: number;
      readonly retryCount: number;
      readonly retryDelayMs: number;
    };
  };
}

type RequiredEnvVar =
  | "POSTGRES_HOST"
  | "POSTGRES_PORT"
  | "POSTGRES_USER"
  | "POSTGRES_PASSWORD"
  | "POSTGRES_DB";

function readRequiredEnvVar(name: RequiredEnvVar, env: EnvSource): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Set it in your .env file (copy .env.example to .env) or in the process environment.`
    );
  }
  return value;
}

function parsePort(name: RequiredEnvVar, rawValue: string): number {
  const port = Number(rawValue);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `Environment variable "${name}" must be a whole number between 1 and 65535, got "${rawValue}".`
    );
  }
  return port;
}

function parseBoundedInteger(
  name: string,
  rawValue: string,
  minimum: number,
  maximum: number
): number {
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `Environment variable "${name}" must be a whole number between ${minimum} and ${maximum}, got "${rawValue}".`
    );
  }
  return value;
}

function readHttpsUrl(name: string, rawValue: string): string {
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`Environment variable "${name}" must be a valid https:// URL.`);
  }
}

/**
 * Loads and validates the backend's typed application config from
 * environment variables. Throws on the first missing or invalid
 * required variable, with a message naming that variable.
 *
 * Pass `env` explicitly in tests; it defaults to `process.env`.
 */
export function loadConfig(env: EnvSource = process.env): AppConfig {
  const host = readRequiredEnvVar("POSTGRES_HOST", env);
  const rawPort = readRequiredEnvVar("POSTGRES_PORT", env);
  const user = readRequiredEnvVar("POSTGRES_USER", env);
  const password = readRequiredEnvVar("POSTGRES_PASSWORD", env);
  const database = readRequiredEnvVar("POSTGRES_DB", env);
  const concurrency = Number(env.BACKTEST_RUNNER_CONCURRENCY ?? "1");
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Environment variable \"BACKTEST_RUNNER_CONCURRENCY\" must be a positive integer.");
  }
  const leaderboardTopK = Number(env.LEADERBOARD_TOP_K ?? "10");
  if (!Number.isInteger(leaderboardTopK) || leaderboardTopK <= 0) {
    throw new Error("Environment variable \"LEADERBOARD_TOP_K\" must be a positive integer.");
  }
  const redisUrl = env.REDIS_URL ?? "redis://localhost:6379";
  try {
    const parsed = new URL(redisUrl);
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") throw new Error();
  } catch {
    throw new Error("Environment variable \"REDIS_URL\" must be a valid redis:// or rediss:// URL.");
  }
  const maxOutboundMessages = Number(env.WS_OUTBOUND_BUFFER_MAX ?? "32");
  if (!Number.isSafeInteger(maxOutboundMessages) || maxOutboundMessages < 1) {
    throw new Error("Environment variable \"WS_OUTBOUND_BUFFER_MAX\" must be a positive integer.");
  }
  // A resource bound on one client, not a count of charts. The page decides how
  // many charts it opens; the API only refuses to hold an unbounded number.
  const maxSubscriptionsPerClient = Number(env.WS_SUBSCRIPTION_MAX ?? "32");
  if (!Number.isSafeInteger(maxSubscriptionsPerClient) || maxSubscriptionsPerClient < 1) {
    throw new Error("Environment variable \"WS_SUBSCRIPTION_MAX\" must be a positive integer.");
  }
  const ingestSymbol = (env.MARKET_INGEST_SYMBOL ?? "BTCUSDT").trim();
  if (ingestSymbol === "") {
    throw new Error("Environment variable \"MARKET_INGEST_SYMBOL\" must not be empty.");
  }
  const ingestTimeframes = (env.MARKET_INGEST_TIMEFRAMES ?? "1m,5m,15m,30m,1h,2h,4h,1d")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (ingestTimeframes.length === 0) {
    throw new Error("Environment variable \"MARKET_INGEST_TIMEFRAMES\" must name at least one timeframe.");
  }
  const streamBaseUrl = env.BINANCE_STREAM_URL ?? "wss://data-stream.binance.vision";
  try {
    const parsed = new URL(streamBaseUrl);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") throw new Error();
  } catch {
    throw new Error("Environment variable \"BINANCE_STREAM_URL\" must be a valid ws:// or wss:// URL.");
  }
  const coinDeskRssUrl = readHttpsUrl(
    "NEWS_COINDESK_RSS_URL",
    env.NEWS_COINDESK_RSS_URL ?? "https://www.coindesk.com/arc/outboundfeeds/rss/"
  );
  const newsPollIntervalMs = parseBoundedInteger(
    "NEWS_POLL_INTERVAL_MS",
    env.NEWS_POLL_INTERVAL_MS ?? "900000",
    60_000,
    86_400_000
  );
  const newsRequestTimeoutMs = parseBoundedInteger(
    "NEWS_REQUEST_TIMEOUT_MS",
    env.NEWS_REQUEST_TIMEOUT_MS ?? "10000",
    1_000,
    60_000
  );
  const newsRetryCount = parseBoundedInteger(
    "NEWS_RETRY_COUNT",
    env.NEWS_RETRY_COUNT ?? "2",
    0,
    3
  );
  const newsRetryDelayMs = parseBoundedInteger(
    "NEWS_RETRY_DELAY_MS",
    env.NEWS_RETRY_DELAY_MS ?? "1000",
    100,
    60_000
  );

  return {
    postgres: {
      host,
      port: parsePort("POSTGRES_PORT", rawPort),
      user,
      password,
      database
    },
    backtestRunner: { concurrency },
    leaderboard: { topK: leaderboardTopK },
    redis: { url: redisUrl },
    websocket: { maxOutboundMessages, maxSubscriptionsPerClient },
    marketIngest: { symbol: ingestSymbol, timeframes: ingestTimeframes, streamBaseUrl },
    news: {
      coinDeskRss: {
        feedUrl: coinDeskRssUrl,
        pollIntervalMs: newsPollIntervalMs,
        requestTimeoutMs: newsRequestTimeoutMs,
        retryCount: newsRetryCount,
        retryDelayMs: newsRetryDelayMs
      }
    }
  };
}
