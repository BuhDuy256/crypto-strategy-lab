// Immutable identity for the exact normalized candle set used by an experiment.
// MKT-10 will create and resolve manifests; this type fixes the public provenance shape.
import type { Timeframe } from "./candle.js";

export interface DatasetTimeRange {
  readonly startTime: number;
  readonly endTime: number;
}

export interface DatasetRef {
  readonly datasetId: string;
  readonly version: number;
  readonly manifestVersion: "v1";
  readonly provider: string;
  readonly symbols: readonly string[];
  readonly timeframe: Timeframe;
  readonly range: DatasetTimeRange;
  readonly revisionWatermark: number;
  readonly integrityHash: string;
}
