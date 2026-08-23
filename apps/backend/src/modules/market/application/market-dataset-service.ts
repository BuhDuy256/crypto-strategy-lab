// Dataset use case: coordinates candle snapshots, canonical identity, and manifest storage.

import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type { Candle } from "../domain/candle.js";
import type { DatasetRef } from "../domain/dataset-ref.js";
import {
  datasetHashPayload,
  findDatasetGaps,
  validateDatasetRequest
} from "../domain/dataset-policy.js";
import type {
  CreateDatasetRequest,
  DatasetManifest,
  ResolvedDataset
} from "../domain/dataset-manifest.js";
import type { MarketDataQuery, MarketDataRangeRequest } from "./market-data-query.js";
import type { DatasetService } from "./dataset-service.js";

export interface DatasetCandleSource extends MarketDataQuery {
  getRangeRevisionWatermark(request: MarketDataRangeRequest): Promise<number>;
}

export interface DatasetManifestStore {
  save(manifest: DatasetManifest): Promise<void>;
  find(ref: DatasetRef): Promise<DatasetManifest | undefined>;
}

export class MarketDatasetService implements DatasetService {
  constructor(
    private readonly candles: DatasetCandleSource,
    private readonly manifests: DatasetManifestStore
  ) {}

  async createDataset(request: CreateDatasetRequest): Promise<DatasetManifest> {
    validateDatasetRequest(request);
    const rangeRequest = {
      provider: request.provider,
      symbol: request.symbol,
      timeframe: request.timeframe,
      startTime: request.range.startTime,
      endTime: request.range.endTime
    };
    const revisionWatermark = await this.candles.getRangeRevisionWatermark(rangeRequest);
    const candles = await this.candles.getCandles({ ...rangeRequest, revisionWatermark });
    const gaps = findDatasetGaps(request, candles);
    const integrityHash = canonicalSha256(
      datasetHashPayload(request, revisionWatermark, candles, gaps)
    );
    const manifest: DatasetManifest = {
      ref: {
        datasetId: `sha256:${integrityHash}`,
        version: 1,
        manifestVersion: "v1",
        provider: request.provider,
        symbols: [request.symbol],
        timeframe: request.timeframe,
        range: request.range,
        revisionWatermark,
        integrityHash
      },
      candleCount: candles.length,
      gaps
    };
    await this.manifests.save(manifest);
    return manifest;
  }

  async resolveDataset(ref: DatasetRef): Promise<ResolvedDataset> {
    const manifest = await this.manifests.find(ref);
    if (manifest === undefined) {
      throw new Error(`DATASET_NOT_FOUND: ${ref.datasetId} version ${ref.version}`);
    }
    if (canonicalSha256(manifest.ref) !== canonicalSha256(ref)) {
      throw new Error(`DATASET_REF_MISMATCH: supplied reference does not match ${ref.datasetId}`);
    }
    const symbol = manifest.ref.symbols[0];
    if (symbol === undefined || manifest.ref.symbols.length !== 1) {
      throw new Error(`DATASET_SYMBOLS: ${manifest.ref.datasetId} must contain exactly one V1 symbol`);
    }
    const request: CreateDatasetRequest = {
      provider: manifest.ref.provider,
      symbol,
      timeframe: manifest.ref.timeframe,
      range: manifest.ref.range
    };
    const candles: readonly Candle[] = await this.candles.getCandles({
      provider: request.provider,
      symbol,
      timeframe: request.timeframe,
      startTime: request.range.startTime,
      endTime: request.range.endTime,
      revisionWatermark: manifest.ref.revisionWatermark
    });
    const actualHash = canonicalSha256(
      datasetHashPayload(request, manifest.ref.revisionWatermark, candles, manifest.gaps)
    );
    if (actualHash !== manifest.ref.integrityHash) {
      throw new Error(`DATASET_INTEGRITY_MISMATCH: ${manifest.ref.datasetId}`);
    }
    return { manifest, candles };
  }
}
