// "Is there still a hole in this range?" - Market Data's own answer.
//
// This is the read that makes recovery checkable from outside the ingest
// process. It exists because a claim that a gap was repaired is worth nothing
// unless something can be asked about the range afterwards and disagree.
//
// It is a read seam and only a read seam: it reports what is stored, never
// fetches from a provider and never repairs anything. Repair belongs to
// `MarketGapRecoveryService`, and neither belongs to the user interface.

import type { Timeframe } from "../domain/candle.js";
import type { DatasetGap } from "../domain/dataset-manifest.js";

export interface MarketGapRangeRequest {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  /** Inclusive candle open-time bounds, aligned to the timeframe. */
  readonly startTime: number;
  readonly endTime: number;
}

export interface MarketGapReport {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly startTime: number;
  readonly endTime: number;
  /** Closed candles the range should contain if nothing was ever lost. */
  readonly expectedCandleCount: number;
  readonly presentCandleCount: number;
  /** Contiguous missing runs, ascending. Empty when the range is complete. */
  readonly gaps: readonly DatasetGap[];
  readonly missingCandleCount: number;
  /** True when no known gap remains in the range. */
  readonly resolved: boolean;
}

export interface MarketGapQuery {
  findGaps(request: MarketGapRangeRequest): Promise<MarketGapReport>;
}
