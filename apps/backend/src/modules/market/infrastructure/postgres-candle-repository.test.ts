// PostgreSQL integration proof for immutable revisions, stable watermarks, and range reads.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import type { Candle } from "../domain/candle.js";
import { PostgresCandleRepository } from "./postgres-candle-repository.js";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 7, 1, 0, 0, 0);

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

function sourceFilesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesBelow(entryPath);
    }
    return entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".sql"))
      ? [entryPath]
      : [];
  });
}

describe("PostgresCandleRepository", () => {
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

  it("treats an identical write as a no-op", async () => {
    const first = await repository.append(candle(START));
    const duplicate = await repository.append(candle(START));

    const rowCount = await pool.query<{ count: string }>("SELECT count(*) FROM market.candles");
    expect(first).toMatchObject({ revision: 1 });
    expect(duplicate).toEqual(first);
    expect(rowCount.rows[0]?.count).toBe("1");
  });

  it("appends changed values as a new local revision and preserves revision 1", async () => {
    const original = await repository.append(candle(START));
    const watermarkAtRevision1 = await repository.getCurrentRevisionWatermark();
    const revised = await repository.append(candle(START, { close: 106 }));

    const historical = await repository.getCandles({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: START,
      endTime: START,
      revisionWatermark: watermarkAtRevision1
    });
    const revisions = await pool.query<{ revision: string }>(
      "SELECT revision FROM market.candles ORDER BY revision"
    );

    expect(original.revision).toBe(1);
    expect(revised).toMatchObject({ revision: 2, close: 106 });
    expect(historical).toEqual([original]);
    expect(revisions.rows.map((row) => Number(row.revision))).toEqual([1, 2]);
  });

  it("returns only the highest revision in the current view", async () => {
    await repository.append(candle(START));
    await repository.append(candle(START, { close: 106 }));

    const current = await repository.getCandles({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: START,
      endTime: START
    });

    expect(current).toEqual([expect.objectContaining({ revision: 2, close: 106 })]);
  });

  it("uses the global ingest watermark when different candles reach the same local revision", async () => {
    await repository.appendMany([candle(START), candle(START + HOUR)]);
    await repository.append(candle(START, { close: 106 }));
    const snapshotWatermark = await repository.getCurrentRevisionWatermark();
    await repository.append(candle(START + HOUR, { close: 107 }));

    const snapshot = await repository.getCandles({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: START,
      endTime: START + HOUR,
      revisionWatermark: snapshotWatermark
    });

    expect(snapshot.map(({ openTime, revision, close }) => ({ openTime, revision, close }))).toEqual([
      { openTime: START, revision: 2, close: 106 },
      { openTime: START + HOUR, revision: 1, close: 105 }
    ]);
  });

  it("returns an inclusive ascending range without fabricating a missing candle", async () => {
    await repository.appendMany([candle(START), candle(START + 2 * HOUR)]);

    const result = await repository.getCandles({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: START,
      endTime: START + 2 * HOUR
    });

    expect(result.map((item) => item.openTime)).toEqual([START, START + 2 * HOUR]);
  });

  it("returns the latest bounded durable snapshot with its commit watermark", async () => {
    await repository.appendMany([
      candle(START), candle(START + HOUR), candle(START + 2 * HOUR)
    ]);

    const snapshot = await repository.getLatestSnapshot({
      provider: "binance", symbol: "BTCUSDT", timeframe: "1h", limit: 2
    });

    expect(snapshot.candles.map((item) => item.openTime)).toEqual([
      START + HOUR, START + 2 * HOUR
    ]);
    expect(snapshot.revisionWatermark).toBeGreaterThan(0);
  });

  it("serializes concurrent set-based backfills without losing revisions", async () => {
    const firstBatch = [candle(START), candle(START + HOUR)];
    const secondBatch = [
      candle(START, { close: 106 }),
      candle(START + HOUR, { close: 107 })
    ];

    await Promise.all([repository.appendMany(firstBatch), repository.appendMany(secondBatch)]);

    const rows = await pool.query<{ open_time: string; revision: string }>(
      "SELECT open_time, revision FROM market.candles ORDER BY open_time, revision"
    );
    expect(rows.rows.map(({ open_time, revision }) => [Number(open_time), Number(revision)])).toEqual([
      [START, 1],
      [START, 2],
      [START + HOUR, 1],
      [START + HOUR, 2]
    ]);
  });

  it("rejects an in-progress candle before it becomes durable", async () => {
    await expect(repository.append(candle(START, { closed: false }))).rejects.toThrow(
      "CANDLE_NOT_CLOSED"
    );
    const rowCount = await pool.query<{ count: string }>("SELECT count(*) FROM market.candles");
    expect(rowCount.rows[0]?.count).toBe("0");
  });

  it("contains no UPDATE or DELETE statement targeting the candle table anywhere in backend", () => {
    const backendRoot = fileURLToPath(new URL("../../../../", import.meta.url));
    const files = [
      ...sourceFilesBelow(join(backendRoot, "migrations")),
      ...sourceFilesBelow(join(backendRoot, "src"))
    ];
    const forbiddenStatement = /\b(?:UPDATE|DELETE\s+FROM)\s+(?:market\.)?candles\b/i;
    const violations = files
      .filter((file) => forbiddenStatement.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(backendRoot.length + 1));

    expect(violations).toEqual([]);
  });
});
