// Pure dataset range and gap rules, independent of hashing and persistence technology.

import { timeframeDurationMs, type Candle } from "./candle.js";
import type { CreateDatasetRequest, DatasetGap } from "./dataset-manifest.js";

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

export function findDatasetGaps(
  request: CreateDatasetRequest,
  candles: readonly Candle[]
): readonly DatasetGap[] {
  const duration = timeframeDurationMs(request.timeframe);
  const present = new Set(candles.map((candle) => candle.openTime));
  const gaps: DatasetGap[] = [];
  let gapStart: number | undefined;
  for (let time = request.range.startTime; time <= request.range.endTime; time += duration) {
    if (!present.has(time) && gapStart === undefined) {
      gapStart = time;
    }
    if (gapStart !== undefined && (present.has(time) || time === request.range.endTime)) {
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
