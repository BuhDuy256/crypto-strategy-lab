// The two invariants recovery must not break, proven against real PostgreSQL.
//
//   1. A range that had a known gap reports no unresolved gap once recovered.
//   2. A dataset snapshot taken before the outage still resolves to the same
//      series and the same integrity hash afterwards.
//
// The second one is the reason recovery is allowed to write at all. Recovery
// appends new revisions to market history, and an experiment that already ran
// against a snapshot must keep resolving to exactly the rows it saw. Nothing in
// the dataset resolver is changed here: this file exists to show the existing
// append-only and watermark rules already hold under recovery.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { timeframeDurationMs, type Candle } from "../domain/candle.js";
import { PostgresCandleRepository } from "../infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "../infrastructure/postgres-dataset-manifest-store.js";
import { FakeMarketDataProvider } from "../testing/fake-market-data-provider.js";
import { MarketDatasetService } from "./market-dataset-service.js";
import { MarketGapRecoveryService } from "./market-gap-recovery-service.js";

const HOUR = timeframeDurationMs("1h");
const START = Date.UTC(2026, 7, 1, 0, 0, 0);
const STREAM = { provider: "binance", symbol: "BTCUSDT", timeframe: "1h" } as const;

/** The outage lost the three candles opening at START+3h, +4h and +5h. */
const LAST_BEFORE_OUTAGE = START + 2 * HOUR;
const OUTAGE_START = START + 3 * HOUR;
const OUTAGE_END = START + 5 * HOUR;
/** Far enough ahead that START+5h is closed and START+6h is still forming. */
const RESUMED_AT = START + 6 * HOUR + 1;

function candle(openTime: number, overrides: Partial<Candle> = {}): Candle {
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    openTime,
    closeTime: openTime + HOUR - 1,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 12,
    closed: true,
    revision: 1,
    ...overrides
  };
}

const logger = {
  log: (): void => undefined,
  warn: (): void => undefined
};

describe("recovery invariants", () => {
  let pool: Pool;
  let repository: PostgresCandleRepository;
  let datasets: MarketDatasetService;
  let recovery: MarketGapRecoveryService;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    repository = new PostgresCandleRepository(pool);
    datasets = new MarketDatasetService(repository, new PostgresDatasetManifestStore(pool));
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE market.datasets RESTART IDENTITY");
    await pool.query("TRUNCATE market.candles RESTART IDENTITY");
    // The provider can serve the whole window, including what the outage lost.
    const everything = [0, 1, 2, 3, 4, 5].map((step) =>
      candle(START + step * HOUR, { close: 100 + step })
    );
    recovery = new MarketGapRecoveryService(
      new FakeMarketDataProvider({
        providerId: "binance",
        candles: everything,
        supportedSymbols: ["BTCUSDT"],
        supportedTimeframes: ["1h"]
      }),
      repository,
      repository,
      logger,
      () => RESUMED_AT
    );
    // What ingest actually committed before the connection dropped.
    await repository.appendMany([
      candle(START, { close: 100 }),
      candle(START + HOUR, { close: 101 }),
      candle(LAST_BEFORE_OUTAGE, { close: 102 })
    ]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("reports the outage as an unresolved gap and reports it resolved after recovery", async () => {
    const before = await repository.findGaps({
      ...STREAM,
      startTime: START,
      endTime: OUTAGE_END
    });

    expect(before.resolved).toBe(false);
    expect(before.expectedCandleCount).toBe(6);
    expect(before.presentCandleCount).toBe(3);
    expect(before.missingCandleCount).toBe(3);
    expect(before.gaps).toStrictEqual([
      { startTime: OUTAGE_START, endTime: OUTAGE_END, missingCandleCount: 3 }
    ]);

    await recovery.recover(STREAM);

    const after = await repository.findGaps({
      ...STREAM,
      startTime: START,
      endTime: OUTAGE_END
    });
    expect(after.resolved).toBe(true);
    expect(after.gaps).toStrictEqual([]);
    expect(after.missingCandleCount).toBe(0);
    expect(after.presentCandleCount).toBe(after.expectedCandleCount);
  });

  it("reports a range with no gap as resolved without any recovery", async () => {
    const report = await repository.findGaps({
      ...STREAM,
      startTime: START,
      endTime: LAST_BEFORE_OUTAGE
    });

    expect(report.resolved).toBe(true);
    expect(report.gaps).toStrictEqual([]);
  });

  it("rejects a gap query whose range is not aligned to the timeframe", async () => {
    await expect(
      repository.findGaps({ ...STREAM, startTime: START + 1, endTime: OUTAGE_END })
    ).rejects.toThrow(/MARKET_GAP_ALIGNMENT/);
  });

  it("keeps a snapshot taken before the outage resolving to its original series and hash", async () => {
    // The snapshot range deliberately covers the candles the outage lost, so
    // recovery writes inside it. If the watermark rule did not hold, this is
    // exactly where the old snapshot would change.
    const manifest = await datasets.createDataset({
      ...STREAM,
      range: { startTime: START, endTime: OUTAGE_END }
    });
    const before = await datasets.resolveDataset(manifest.ref);

    expect(manifest.candleCount).toBe(3);
    expect(manifest.gaps).toStrictEqual([
      { startTime: OUTAGE_START, endTime: OUTAGE_END, missingCandleCount: 3 }
    ]);

    const outcome = await recovery.recover(STREAM);
    expect(outcome.recovered).toBe(3);

    const after = await datasets.resolveDataset(manifest.ref);

    // resolveDataset recomputes the integrity hash and throws on mismatch, so
    // this call succeeding is already most of the proof. The assertions make
    // the failure legible if it ever stops holding.
    expect(after.manifest.ref.integrityHash).toBe(manifest.ref.integrityHash);
    expect(after.manifest.ref.datasetId).toBe(manifest.ref.datasetId);
    expect(after.manifest.ref.revisionWatermark).toBe(manifest.ref.revisionWatermark);
    expect(after.candles).toStrictEqual(before.candles);
    expect(after.candles.map((entry) => entry.openTime)).toStrictEqual([
      START,
      START + HOUR,
      LAST_BEFORE_OUTAGE
    ]);
  });

  it("lets a snapshot taken after recovery see the recovered candles", async () => {
    // The counterpart to the test above: recovery is not invisible, it is only
    // invisible to snapshots that were taken before it.
    await recovery.recover(STREAM);

    const manifest = await datasets.createDataset({
      ...STREAM,
      range: { startTime: START, endTime: OUTAGE_END }
    });

    expect(manifest.candleCount).toBe(6);
    expect(manifest.gaps).toStrictEqual([]);
  });
});
