// Pure dataset range and gap rules, independent of hashing and persistence technology.

import { timeframeDurationMs, type Candle, type Timeframe } from "./candle.js";
import type { CreateDatasetRequest, DatasetGap } from "./dataset-manifest.js";
import type { DatasetTimeRange } from "./dataset-ref.js";

export function validateDatasetRequest(request: CreateDatasetRequest): void {
  const duration = timeframeDurationMs(request.timeframe);
  if (
    !Number.isSafeInteger(request.range.startTime) ||
    !Number.isSafeInteger(request.range.endTime) ||
    request.range.startTime > request.range.endTime
  ) {
    throw new Error("DATASET_RANGE: startTime and endTime must form a valid inclusive range");
  }
  if (request.range.startTime % duration !== 0 || request.range.endTime % duration !== 0) {
    throw new Error(`DATASET_RANGE_ALIGNMENT: range must align to ${request.timeframe} candle open times`);
  }
}

/**
 * Aligned candle open times missing from `candles` inside `range`.
 *
 * This is the one place the "which intervals are absent" question is answered.
 * Dataset creation asks it to record a snapshot's data-quality gaps, and the
 * Market gap query asks it to report whether an outage left an unresolved gap;
 * both must agree, so both call this rather than repeat the arithmetic.
 */
export function findMissingRanges(
  timeframe: Timeframe,
  range: DatasetTimeRange,
  candles: readonly Candle[]
): readonly DatasetGap[] {
  const duration = timeframeDurationMs(timeframe);
  const present = new Set(candles.map((candle) => candle.openTime));
  const gaps: DatasetGap[] = [];
  let gapStart: number | undefined;
  for (let time = range.startTime; time <= range.endTime; time += duration) {
    if (!present.has(time) && gapStart === undefined) {
      gapStart = time;
    }
    if (gapStart !== undefined && (present.has(time) || time === range.endTime)) {
      const startTime = gapStart;
      const endTime = present.has(time) ? time - duration : time;
      gaps.push({
        startTime,
        endTime,
        missingCandleCount: (endTime - startTime) / duration + 1
      });
      gapStart = undefined;
    }
  }
  return gaps;
}

export function findDatasetGaps(
  request: CreateDatasetRequest,
  candles: readonly Candle[]
): readonly DatasetGap[] {
  return findMissingRanges(request.timeframe, request.range, candles);
}

export function datasetHashPayload(
  request: CreateDatasetRequest,
  watermark: number,
  candles: readonly Candle[],
  gaps: readonly DatasetGap[]
): object {
  return {
    manifestVersion: "v1",
    provider: request.provider,
    symbols: [request.symbol],
    timeframe: request.timeframe,
    range: request.range,
    revisionWatermark: watermark,
    candleCount: candles.length,
    gaps,
    candles
  };
}
