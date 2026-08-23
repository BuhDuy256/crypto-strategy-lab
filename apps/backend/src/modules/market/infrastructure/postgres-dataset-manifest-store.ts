// Narrow PostgreSQL adapter that only saves and retrieves immutable dataset manifests.

import type { Pool } from "pg";
import type { DatasetManifestStore } from "../application/market-dataset-service.js";
import type { DatasetRef } from "../domain/dataset-ref.js";
import type { DatasetGap, DatasetManifest } from "../domain/dataset-manifest.js";

interface DatasetRow {
  readonly dataset_id: string;
  readonly version: number;
  readonly manifest_version: "v1";
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: DatasetRef["timeframe"];
  readonly start_time: string;
  readonly end_time: string;
  readonly revision_watermark: string;
  readonly candle_count: number;
  readonly gaps: DatasetGap[];
  readonly integrity_hash: string;
}

function manifestFromRow(row: DatasetRow): DatasetManifest {
  return {
    ref: {
      datasetId: row.dataset_id,
      version: row.version,
      manifestVersion: row.manifest_version,
      provider: row.provider,
      symbols: [row.symbol],
      timeframe: row.timeframe,
      range: { startTime: Number(row.start_time), endTime: Number(row.end_time) },
      revisionWatermark: Number(row.revision_watermark),
      integrityHash: row.integrity_hash
    },
    candleCount: row.candle_count,
    gaps: row.gaps
  };
}

export class PostgresDatasetManifestStore implements DatasetManifestStore {
  constructor(private readonly pool: Pool) {}

  async save(manifest: DatasetManifest): Promise<void> {
    const symbol = manifest.ref.symbols[0];
    if (symbol === undefined || manifest.ref.symbols.length !== 1) {
      throw new Error(`DATASET_SYMBOLS: ${manifest.ref.datasetId} must contain exactly one V1 symbol`);
    }
    await this.pool.query(
      `
        INSERT INTO market.datasets (
          dataset_id, version, manifest_version, provider, symbol, timeframe,
          start_time, end_time, revision_watermark, candle_count, gaps, integrity_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
        ON CONFLICT (dataset_id, version) DO NOTHING
      `,
      [
        manifest.ref.datasetId,
        manifest.ref.version,
        manifest.ref.manifestVersion,
        manifest.ref.provider,
        symbol,
        manifest.ref.timeframe,
        manifest.ref.range.startTime,
        manifest.ref.range.endTime,
        manifest.ref.revisionWatermark,
        manifest.candleCount,
        JSON.stringify(manifest.gaps),
        manifest.ref.integrityHash
      ]
    );
  }

  async find(ref: DatasetRef): Promise<DatasetManifest | undefined> {
    const result = await this.pool.query<DatasetRow>(
      `
        SELECT
          dataset_id, version, manifest_version, provider, symbol, timeframe,
          start_time, end_time, revision_watermark, candle_count, gaps, integrity_hash
        FROM market.datasets
        WHERE dataset_id = $1 AND version = $2
      `,
      [ref.datasetId, ref.version]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : manifestFromRow(row);
  }
}
