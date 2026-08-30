// PostgreSQL integration proof for gap recovery.
//
// The provider is faked so the missing range is controlled exactly; the storage
// is real, because the properties that matter - candle identity, ordering, no
// duplicate rows, no unnecessary revision - are properties of the append-only
// write path and cannot be proven against an in-memory double.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { timeframeDurationMs, type Candle } from "../domain/candle.js";
import { PostgresCandleRepository } from "../infrastructure/postgres-candle-repository.js";
import { FakeMarketDataProvider } from "../testing/fake-market-data-provider.js";
import { MarketGapRecoveryService } from "./market-gap-recovery-service.js";

const HOUR = timeframeDurationMs("1h");
const START = Date.UTC(2026, 7, 1, 0, 0, 0);
const STREAM = { provider: "binance", symbol: "BTCUSDT", timeframe: "1h" } as const;

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

function providerHolding(candles: readonly Candle[]): FakeMarketDataProvider {
  return new FakeMarketDataProvider({
    providerId: "binance",
    candles,
    supportedSymbols: ["BTCUSDT"],
    supportedTimeframes: ["1h"]
  });
}

async function rowCount(pool: Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM market.candles"
  );
  return Number(result.rows[0]?.count ?? 0);
}

describe("MarketGapRecoveryService", () => {
  let pool: Pool;
  let repository: PostgresCandleRepository;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    repository = new PostgresCandleRepository(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE market.candles RESTART IDENTITY");
  });

  afterAll(async () => {
    await pool?.end();
  });

  /**
   * Seeds one committed candle at START and puts the clock far enough ahead
   * that START+1h, START+2h, and START+3h are all closed while START+4h is
   * still forming.
   */
  async function seedOutage(): Promise<{
    readonly missing: readonly Candle[];
    readonly now: number;
  }> {
    await repository.appendMany([candle(START)]);
    const missing = [
      candle(START + HOUR, { close: 106 }),
      candle(START + 2 * HOUR, { close: 107 }),
      candle(START + 3 * HOUR, { close: 108 })
    ];
    return { missing, now: START + 4 * HOUR + 1 };
  }

  it("fetches and stores exactly the candles the outage lost, in order", async () => {
    const { missing, now } = await seedOutage();
    const service = new MarketGapRecoveryService(
      // The provider also holds the candle that is already stored and the one
      // still forming, so this proves the range asked for is the missing one.
      providerHolding([candle(START), ...missing, candle(START + 4 * HOUR)]),
      repository,
      repository,
      logger,
      () => now
    );

    const outcome = await service.recover(STREAM);

    expect(outcome.missing).toBe(3);
    expect(outcome.recovered).toBe(3);
    expect(outcome.startTime).toBe(START + HOUR);
    expect(outcome.endTime).toBe(START + 3 * HOUR);
    expect(outcome.incomplete).toBe(false);

    const stored = await repository.getCandles({
      ...STREAM,
      startTime: START,
      endTime: START + 4 * HOUR
    });
    expect(stored.map((entry) => entry.openTime)).toStrictEqual([
      START,
      START + HOUR,
      START + 2 * HOUR,
      START + 3 * HOUR
    ]);
    // The forming interval is not a closed candle and was never asked for.
    expect(stored.map((entry) => entry.openTime)).not.toContain(START + 4 * HOUR);
    expect(stored.every((entry) => entry.revision === 1)).toBe(true);
    expect(stored.every((entry) => entry.provider === "binance")).toBe(true);
  });

  it("creates no duplicate row and no new revision when recovery runs again", async () => {
    const { missing, now } = await seedOutage();
    const service = new MarketGapRecoveryService(
      providerHolding([candle(START), ...missing]),
      repository,
      repository,
      logger,
      () => now
    );

    await service.recover(STREAM);
    const countAfterFirst = await rowCount(pool);
    const watermarkAfterFirst = await repository.getCurrentRevisionWatermark();

    const second = await service.recover(STREAM);

    expect(await rowCount(pool)).toBe(countAfterFirst);
    // No new row means no new ingest sequence, so dataset watermarks are stable.
    expect(await repository.getCurrentRevisionWatermark()).toBe(watermarkAfterFirst);
    // The second pass finds nothing missing at all, which is the point.
    expect(second.missing).toBe(0);
    expect(second.recovered).toBe(0);
    expect(second.incomplete).toBe(false);

    const stored = await repository.getCandles({
      ...STREAM,
      startTime: START,
      endTime: START + 3 * HOUR
    });
    expect(stored.every((entry) => entry.revision === 1)).toBe(true);
  });

  it("still adds a revision when the provider corrects a candle it already sent", async () => {
    // Proves recovery goes through the ordinary append-only path rather than a
    // parallel write that would silently ignore a corrected payload.
    const { missing, now } = await seedOutage();
    await new MarketGapRecoveryService(
      providerHolding([candle(START), ...missing]),
      repository,
      repository,
      logger,
      () => now
    ).recover(STREAM);

    const corrected = candle(START + 2 * HOUR, { close: 999, high: 1_000 });
    await repository.appendMany([corrected]);

    const stored = await repository.getCandles({
      ...STREAM,
      startTime: START + 2 * HOUR,
      endTime: START + 2 * HOUR
    });
    expect(stored[0]?.revision).toBe(2);
    expect(stored[0]?.close).toBe(999);
  });

  it("does nothing when no closed interval is missing", async () => {
    await repository.appendMany([candle(START)]);
    const service = new MarketGapRecoveryService(
      providerHolding([candle(START), candle(START + HOUR)]),
      repository,
      repository,
      logger,
      // Still inside the interval that opened at START + 1h, so nothing after
      // START has closed yet.
      () => START + HOUR + 1
    );

    const outcome = await service.recover(STREAM);

    expect(outcome.missing).toBe(0);
    expect(outcome.recovered).toBe(0);
    expect(outcome.incomplete).toBe(false);
    expect(await rowCount(pool)).toBe(1);
  });

  it("reports the gap as unresolved when the provider returns nothing for it", async () => {
    const { now } = await seedOutage();
    const service = new MarketGapRecoveryService(
      providerHolding([candle(START)]),
      repository,
      repository,
      logger,
      () => now
    );

    const outcome = await service.recover(STREAM);

    expect(outcome.missing).toBe(3);
    expect(outcome.recovered).toBe(0);
    expect(outcome.incomplete).toBe(true);
    expect(await rowCount(pool)).toBe(1);
  });

  it("recovers nothing for a stream that was never committed", async () => {
    // Repairing a range that was never subscribed is outside this slice.
    const service = new MarketGapRecoveryService(
      providerHolding([candle(START), candle(START + HOUR)]),
      repository,
      repository,
      logger,
      () => START + 4 * HOUR + 1
    );

    const outcome = await service.recover(STREAM);

    expect(outcome.missing).toBe(0);
    expect(await rowCount(pool)).toBe(0);
  });
});
