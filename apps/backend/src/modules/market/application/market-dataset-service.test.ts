// PostgreSQL integration proof for immutable, reproducible dataset manifests.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import type { Candle } from "../domain/candle.js";
import { PostgresCandleRepository } from "../infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "../infrastructure/postgres-dataset-manifest-store.js";
import { MarketDatasetService } from "./market-dataset-service.js";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 7, 1);

function candle(openTime: number, close = 105): Candle {
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    openTime,
    closeTime: openTime + HOUR - 1,
    open: 100,
    high: 110,
    low: 90,
    close,
    volume: 12,
    closed: true,
    revision: 1
  };
}

describe("PostgresDatasetService", () => {
  let pool: Pool;
  let candles: PostgresCandleRepository;
  let datasets: MarketDatasetService;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    candles = new PostgresCandleRepository(pool);
    datasets = new MarketDatasetService(candles, new PostgresDatasetManifestStore(pool));
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE market.datasets, market.candles RESTART IDENTITY");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates a content-addressed manifest and resolves the exact candles", async () => {
    await candles.appendMany([candle(START), candle(START + HOUR)]);
    const manifest = await datasets.createDataset({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: { startTime: START, endTime: START + HOUR }
    });

    const resolved = await datasets.resolveDataset(manifest.ref);
    expect(manifest).toMatchObject({ candleCount: 2, gaps: [] });
    expect(manifest.ref.datasetId).toBe(`sha256:${manifest.ref.integrityHash}`);
    expect(resolved.candles).toEqual([candle(START), candle(START + HOUR)]);
  });

  it("produces the same identity and hash for the same snapshot definition", async () => {
    await candles.append(candle(START));
    const request = {
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h" as const,
      range: { startTime: START, endTime: START }
    };
    const first = await datasets.createDataset(request);
    await candles.append(candle(START + HOUR));
    const second = await datasets.createDataset(request);
    const count = await pool.query<{ count: string }>("SELECT count(*) FROM market.datasets");

    expect(second).toEqual(first);
    expect(count.rows[0]?.count).toBe("1");
  });

  it("resolves an old snapshot unchanged after a later candle revision", async () => {
    await candles.append(candle(START));
    const manifest = await datasets.createDataset({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: { startTime: START, endTime: START }
    });
    await candles.append(candle(START, 106));

    const resolved = await datasets.resolveDataset(manifest.ref);
    expect(resolved.candles).toEqual([candle(START)]);
    expect(resolved.manifest.ref.integrityHash).toBe(manifest.ref.integrityHash);
  });

  it("records consecutive missing candles as an explicit gap", async () => {
    await candles.appendMany([candle(START), candle(START + 3 * HOUR)]);
    const manifest = await datasets.createDataset({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: { startTime: START, endTime: START + 3 * HOUR }
    });

    expect(manifest.gaps).toEqual([
      { startTime: START + HOUR, endTime: START + 2 * HOUR, missingCandleCount: 2 }
    ]);
  });

  it("rejects an attempt to mutate a stored dataset", async () => {
    await candles.append(candle(START));
    const manifest = await datasets.createDataset({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: { startTime: START, endTime: START }
    });

    await expect(
      pool.query("UPDATE market.datasets SET candle_count = 0 WHERE dataset_id = $1", [
        manifest.ref.datasetId
      ])
    ).rejects.toThrow("market datasets are immutable");
  });
});
