// Durable latest-candle snapshot seam used by realtime transport recovery.

import type { Candle, Timeframe } from "../domain/candle.js";

export interface MarketSnapshotRequest {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly limit: number;
}

export interface MarketSnapshot {
  readonly candles: readonly Candle[];
  readonly revisionWatermark: number;
}

export interface MarketSnapshotQuery {
  getLatestSnapshot(request: MarketSnapshotRequest): Promise<MarketSnapshot>;
}
