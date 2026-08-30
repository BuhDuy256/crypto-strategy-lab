// Provider-neutral durable candle read contract shared through the Market module surface.

import type { Candle, Timeframe } from "../domain/candle.js";

/** Inclusive durable-candle range read at the current state or an immutable watermark. */
export interface MarketDataRangeRequest {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly startTime: number;
  readonly endTime: number;
  readonly revisionWatermark?: number;
}

/** Provider-neutral application seam used by charts and experiments. */
export interface MarketDataQuery {
  getCandles(request: MarketDataRangeRequest): Promise<readonly Candle[]>;
}
