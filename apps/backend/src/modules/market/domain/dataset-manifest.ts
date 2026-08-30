// Immutable manifest and explicit data-quality gaps for one candle dataset snapshot.

import type { Candle, Timeframe } from "./candle.js";
import type { DatasetRef, DatasetTimeRange } from "./dataset-ref.js";

export interface DatasetGap {
  readonly startTime: number;
  readonly endTime: number;
  readonly missingCandleCount: number;
}

export interface CreateDatasetRequest {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly range: DatasetTimeRange;
}

export interface DatasetManifest {
  readonly ref: DatasetRef;
  readonly candleCount: number;
  readonly gaps: readonly DatasetGap[];
}

export interface ResolvedDataset {
  readonly manifest: DatasetManifest;
  readonly candles: readonly Candle[];
}
