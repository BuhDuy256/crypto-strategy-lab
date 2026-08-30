// PROOF-PROVIDER-001 exercises a second adapter through Market-owned seams.

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import type { Candle } from "../domain/candle.js";
import { PostgresCandleRepository } from "../infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "../infrastructure/postgres-dataset-manifest-store.js";
import { FakeMarketDataProvider } from "../testing/fake-market-data-provider.js";
import { defineMarketDataProviderContract } from "../testing/market-data-provider-contract.js";
import { MarketDatasetService } from "./market-dataset-service.js";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 7, 1);
const proofCandles: readonly Candle[] = [0, 1].map((offset) => ({
  provider: "proof-provider",
  symbol: "BTCUSDT",
  timeframe: "1h",
  openTime: START + offset * HOUR,
  closeTime: START + (offset + 1) * HOUR - 1,
  open: 100 + offset,
  high: 110 + offset,
  low: 90 + offset,
  close: 105 + offset,
  volume: 12 + offset,
  closed: true,
  revision: 1
}));

function proofProvider(): FakeMarketDataProvider {
  return new FakeMarketDataProvider({
    providerId: "proof-provider",
    candles: proofCandles,
    supportedSymbols: ["BTCUSDT"],
    supportedTimeframes: ["1h"]
  });
}

defineMarketDataProviderContract("Proof second provider", () => ({
  provider: proofProvider(),
  supportedRequest: {
    symbol: "BTCUSDT",
    timeframe: "1h",
    startTime: START,
    endTime: START + HOUR
  },
  unsupportedSymbolRequest: {
    symbol: "ETHUSDT",
    timeframe: "1h",
    startTime: START,
    endTime: START
  },
  unsupportedTimeframeRequest: {
    symbol: "BTCUSDT",
    timeframe: "5m",
    startTime: START,
    endTime: START
  }
}));

describe("PROOF-PROVIDER-001 dataset path", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await resetTestDatabase();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists and resolves normalized second-provider candles", async () => {
    const normalized = await proofProvider().fetchHistorical({
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: START,
      endTime: START + HOUR
    });
    const repository = new PostgresCandleRepository(pool);
    await repository.appendMany(normalized);
    const datasets = new MarketDatasetService(
      repository,
      new PostgresDatasetManifestStore(pool)
    );
    const manifest = await datasets.createDataset({
      provider: "proof-provider",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: { startTime: START, endTime: START + HOUR }
    });

    const resolved = await datasets.resolveDataset(manifest.ref);
    expect(resolved.candles).toEqual(proofCandles);
    expect(resolved.manifest.ref.provider).toBe("proof-provider");
  });
});
