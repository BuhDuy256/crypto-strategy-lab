// Market Data's external-provider seam. Provider-specific payloads and transport
// behavior stay behind adapters; callers receive only normalized domain contracts.
import type { Candle, Timeframe } from "../domain/candle.js";

export interface HistoricalCandlesRequest {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  /** Inclusive candle open-time lower bound, in Unix epoch milliseconds. */
  readonly startTime: number;
  /** Inclusive candle open-time upper bound, in Unix epoch milliseconds. */
  readonly endTime: number;
}

export interface LiveCandlesRequest {
  readonly symbol: string;
  readonly timeframe: Timeframe;
}

export type ProviderHealthStatus = "healthy" | "degraded" | "unavailable";

export interface ProviderHealth {
  readonly provider: string;
  readonly status: ProviderHealthStatus;
  readonly checkedAt: number;
  readonly reason?: string;
}

export type MarketDataProviderErrorCode =
  | "UNSUPPORTED_SYMBOL"
  | "UNSUPPORTED_TIMEFRAME"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_PROVIDER_DATA"
  | "NOT_SUPPORTED";

export class MarketDataProviderError extends Error {
  override readonly name = "MarketDataProviderError";

  constructor(
    readonly code: MarketDataProviderErrorCode,
    readonly provider: string,
    message: string
  ) {
    super(message);
  }
}

export interface MarketDataProvider {
  /** Returns unique, closed candles ordered by ascending open time. */
  fetchHistorical(request: HistoricalCandlesRequest): Promise<readonly Candle[]>;
  /**
   * Returns a live stream. A V1 historical-only adapter may throw
   * `MarketDataProviderError` with code `NOT_SUPPORTED`.
   */
  subscribeLive(request: LiveCandlesRequest): AsyncIterable<Candle>;
  getHealth(): Promise<ProviderHealth>;
}
