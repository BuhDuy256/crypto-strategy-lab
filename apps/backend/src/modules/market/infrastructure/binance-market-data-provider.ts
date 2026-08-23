// Binance Spot REST adapter. Provider payloads are normalized here and never leave Market Data.
import {
  MarketDataProviderError,
  type HistoricalCandlesRequest,
  type LiveCandlesRequest,
  type MarketDataProvider,
  type ProviderHealth
} from "../application/market-data-provider.js";
import {
  SUPPORTED_TIMEFRAMES,
  assertHistoricalCandleSeries,
  timeframeDurationMs,
  type Candle
} from "../domain/candle.js";
import {
  FetchBinanceHttpClient,
  type BinanceHttpClient,
  type BinanceHttpResponse
} from "./binance-http-client.js";

const PROVIDER_ID = "binance";
const DEFAULT_BASE_URL = "https://data-api.binance.vision";
const PAGE_LIMIT = 1000;
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 1000;
const SUPPORTED_SYMBOLS: ReadonlySet<string> = new Set(["BTCUSDT"]);
const BINANCE_TIMEFRAMES: ReadonlySet<string> = new Set(SUPPORTED_TIMEFRAMES);

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export interface BinanceMarketDataProviderOptions {
  readonly httpClient?: BinanceHttpClient;
  readonly baseUrl?: string;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
}

export class BinanceMarketDataProvider implements MarketDataProvider {
  private readonly httpClient: BinanceHttpClient;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private readonly sleep: (delayMs: number) => Promise<void>;

  constructor(options: BinanceMarketDataProviderOptions = {}) {
    this.httpClient = options.httpClient ?? new FetchBinanceHttpClient();
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleep;
  }

  async fetchHistorical(request: HistoricalCandlesRequest): Promise<readonly Candle[]> {
    this.assertSupported(request.symbol, request.timeframe);
    const candles: Candle[] = [];
    let pageStart = request.startTime;

    while (pageStart <= request.endTime) {
      const response = await this.getWithRateLimitBackoff(
        this.buildKlineUrl(request, pageStart),
        request
      );
      if (response.status !== 200) {
        throw new MarketDataProviderError(
          "PROVIDER_UNAVAILABLE",
          PROVIDER_ID,
          `Binance kline request failed with HTTP ${response.status} for ${request.symbol} ${request.timeframe}.`
        );
      }

      if (!Array.isArray(response.body)) {
        throw new MarketDataProviderError(
          "INVALID_PROVIDER_DATA",
          PROVIDER_ID,
          `Binance kline response for ${request.symbol} ${request.timeframe} must be an array.`
        );
      }
      if (response.body.length === 0) {
        break;
      }

      const page = this.normalizeKlines(response.body, request);
      candles.push(...page);
      if (response.body.length < PAGE_LIMIT) {
        break;
      }

      const lastCandle = page.at(-1);
      if (lastCandle === undefined) {
        break;
      }
      const nextPageStart = lastCandle.openTime + timeframeDurationMs(request.timeframe);
      if (nextPageStart <= pageStart) {
        throw new MarketDataProviderError(
          "INVALID_PROVIDER_DATA",
          PROVIDER_ID,
          `Binance kline page did not advance after ${pageStart} for ${request.symbol} ${request.timeframe}.`
        );
      }
      pageStart = nextPageStart;
    }

    this.assertNormalizedSeries(candles, request);
    return candles;
  }

  subscribeLive(request: LiveCandlesRequest): AsyncIterable<Candle> {
    this.assertSupported(request.symbol, request.timeframe);
    throw new MarketDataProviderError(
      "NOT_SUPPORTED",
      PROVIDER_ID,
      "Binance live subscriptions are not implemented in V1."
    );
  }

  async getHealth(): Promise<ProviderHealth> {
    return { provider: PROVIDER_ID, status: "healthy", checkedAt: this.now() };
  }

  private buildKlineUrl(request: HistoricalCandlesRequest, pageStart: number): URL {
    const url = new URL("/api/v3/klines", this.baseUrl);
    url.searchParams.set("symbol", request.symbol);
    url.searchParams.set("interval", request.timeframe);
    url.searchParams.set("startTime", String(pageStart));
    url.searchParams.set("endTime", String(request.endTime));
    url.searchParams.set("limit", String(PAGE_LIMIT));
    return url;
  }

  private async getWithRateLimitBackoff(
    url: URL,
    request: HistoricalCandlesRequest
  ): Promise<BinanceHttpResponse> {
    for (let retry = 0; retry <= MAX_RATE_LIMIT_RETRIES; retry += 1) {
      let response: BinanceHttpResponse;
      try {
        response = await this.httpClient.get(url);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "unknown transport failure";
        throw new MarketDataProviderError(
          "PROVIDER_UNAVAILABLE",
          PROVIDER_ID,
          `Binance transport failed for ${request.symbol} ${request.timeframe}: ${reason}`
        );
      }
      if (response.status !== 418 && response.status !== 429) {
        return response;
      }
      if (retry === MAX_RATE_LIMIT_RETRIES) {
        throw new MarketDataProviderError(
          "RATE_LIMITED",
          PROVIDER_ID,
          `Binance rate limit persisted after ${MAX_RATE_LIMIT_RETRIES} retries for ${request.symbol} ${request.timeframe}.`
        );
      }

      await this.sleep(this.rateLimitDelayMs(response.headers, retry));
    }

    throw new MarketDataProviderError(
      "RATE_LIMITED",
      PROVIDER_ID,
      `Binance rate limit retry loop ended unexpectedly for ${request.symbol} ${request.timeframe}.`
    );
  }

  private rateLimitDelayMs(headers: Headers, retry: number): number {
    const retryAfter = headers.get("Retry-After");
    if (retryAfter !== null) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
      }
    }
    return DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** retry;
  }

  private assertSupported(symbol: string, timeframe: string): void {
    if (!SUPPORTED_SYMBOLS.has(symbol)) {
      throw new MarketDataProviderError(
        "UNSUPPORTED_SYMBOL",
        PROVIDER_ID,
        `Binance adapter does not support symbol "${symbol}" in V1.`
      );
    }
    if (!BINANCE_TIMEFRAMES.has(timeframe)) {
      throw new MarketDataProviderError(
        "UNSUPPORTED_TIMEFRAME",
        PROVIDER_ID,
        `Binance adapter does not support timeframe "${timeframe}".`
      );
    }
  }

  private normalizeKlines(
    rows: readonly unknown[],
    request: HistoricalCandlesRequest
  ): Candle[] {
    try {
      const candles = rows
        .map((row) => this.mapKline(row, request))
        .filter((candle) => candle.closed);
      assertHistoricalCandleSeries(candles);
      return candles;
    } catch (error: unknown) {
      if (error instanceof MarketDataProviderError) {
        throw error;
      }
      throw this.invalidProviderData(request, error);
    }
  }

  private assertNormalizedSeries(
    candles: readonly Candle[],
    request: HistoricalCandlesRequest
  ): void {
    try {
      assertHistoricalCandleSeries(candles);
      const duration = timeframeDurationMs(request.timeframe);
      let previousOpenTime: number | undefined;
      for (const candle of candles) {
        if (candle.openTime < request.startTime || candle.openTime > request.endTime) {
          throw new Error(
            `CANDLE_REQUEST_RANGE: open time ${candle.openTime} is outside ${request.startTime}..${request.endTime}`
          );
        }
        if (
          previousOpenTime !== undefined &&
          candle.openTime !== previousOpenTime + duration
        ) {
          throw new Error(
            `CANDLE_SERIES_GAP: expected open time ${previousOpenTime + duration}, got ${candle.openTime}`
          );
        }
        previousOpenTime = candle.openTime;
      }
    } catch (error: unknown) {
      throw this.invalidProviderData(request, error);
    }
  }

  private invalidProviderData(
    request: HistoricalCandlesRequest,
    cause: unknown
  ): MarketDataProviderError {
    const reason = cause instanceof Error ? cause.message : "unknown validation failure";
    return new MarketDataProviderError(
      "INVALID_PROVIDER_DATA",
      PROVIDER_ID,
      `Invalid Binance kline data for ${request.symbol} ${request.timeframe}: ${reason}`
    );
  }

  private mapKline(row: unknown, request: HistoricalCandlesRequest): Candle {
    if (!Array.isArray(row) || row.length !== 12) {
      throw new MarketDataProviderError(
        "INVALID_PROVIDER_DATA",
        PROVIDER_ID,
        `Binance kline for ${request.symbol} ${request.timeframe} must contain 12 fields.`
      );
    }

    const openTime = this.timestamp(row[0], "open time");
    const closeTime = this.timestamp(row[6], "close time");

    return {
      provider: PROVIDER_ID,
      symbol: request.symbol,
      timeframe: request.timeframe,
      openTime,
      open: this.finiteNumber(row[1], "open"),
      high: this.finiteNumber(row[2], "high"),
      low: this.finiteNumber(row[3], "low"),
      close: this.finiteNumber(row[4], "close"),
      volume: this.finiteNumber(row[5], "volume"),
      closeTime,
      closed: closeTime < this.now(),
      revision: 1
    };
  }

  private timestamp(value: unknown, field: string): number {
    const parsed = this.finiteNumber(value, field);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`${field} must be a non-negative safe integer, got ${String(value)}`);
    }
    return parsed;
  }

  private finiteNumber(value: unknown, field: string): number {
    if (typeof value !== "number" && typeof value !== "string") {
      throw new Error(`${field} must be a number or numeric string, got ${typeof value}`);
    }
    if (typeof value === "string" && value.trim() === "") {
      throw new Error(`${field} must not be an empty numeric string`);
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${field} must be finite, got ${String(value)}`);
    }
    return parsed;
  }
}
