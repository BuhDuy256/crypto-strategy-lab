// Deterministic in-memory adapter for provider conformance and downstream tests.
// It implements only V1 historical behavior and reports live data as unsupported.
import type { Candle, Timeframe } from "../domain/candle.js";
import {
  MarketDataProviderError,
  type HistoricalCandlesRequest,
  type LiveCandlesRequest,
  type MarketDataProvider,
  type ProviderHealth
} from "../application/market-data-provider.js";

export interface FakeMarketDataProviderOptions {
  readonly providerId: string;
  readonly candles: readonly Candle[];
  readonly supportedSymbols: readonly string[];
  readonly supportedTimeframes: readonly Timeframe[];
}

export class FakeMarketDataProvider implements MarketDataProvider {
  private readonly providerId: string;
  private readonly candles: readonly Candle[];
  private readonly supportedSymbols: ReadonlySet<string>;
  private readonly supportedTimeframes: ReadonlySet<Timeframe>;

  constructor(options: FakeMarketDataProviderOptions) {
    this.providerId = options.providerId;
    this.candles = options.candles;
    this.supportedSymbols = new Set(options.supportedSymbols);
    this.supportedTimeframes = new Set(options.supportedTimeframes);
  }

  async fetchHistorical(request: HistoricalCandlesRequest): Promise<readonly Candle[]> {
    this.assertSupported(request.symbol, request.timeframe);
    return this.candles.filter(
      (candle) =>
        candle.provider === this.providerId &&
        candle.symbol === request.symbol &&
        candle.timeframe === request.timeframe &&
        candle.openTime >= request.startTime &&
        candle.openTime <= request.endTime
    );
  }

  subscribeLive(request: LiveCandlesRequest): AsyncIterable<Candle> {
    this.assertSupported(request.symbol, request.timeframe);
    throw new MarketDataProviderError(
      "NOT_SUPPORTED",
      this.providerId,
      `Provider "${this.providerId}" does not support live subscriptions in V1.`
    );
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      provider: this.providerId,
      status: "healthy",
      checkedAt: Date.now()
    };
  }

  private assertSupported(symbol: string, timeframe: Timeframe): void {
    if (!this.supportedSymbols.has(symbol)) {
      throw new MarketDataProviderError(
        "UNSUPPORTED_SYMBOL",
        this.providerId,
        `Provider "${this.providerId}" does not support symbol "${symbol}".`
      );
    }
    if (!this.supportedTimeframes.has(timeframe)) {
      throw new MarketDataProviderError(
        "UNSUPPORTED_TIMEFRAME",
        this.providerId,
        `Provider "${this.providerId}" does not support timeframe "${timeframe}".`
      );
    }
  }
}
