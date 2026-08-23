// Contract-level examples for normalized historical candle behavior.
import { describe, expect, it } from "vitest";
import {
  assertHistoricalCandleSeries,
  candleIdentity,
  timeframeDurationMs
} from "./candle.js";
import type { Candle } from "./candle.js";

const HOUR = 3_600_000;
const OPEN_TIME = Date.UTC(2026, 7, 1, 0, 0, 0);

function validCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    openTime: OPEN_TIME,
    closeTime: OPEN_TIME + HOUR - 1,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 12.5,
    closed: true,
    revision: 1,
    ...overrides
  };
}

describe("normalized historical candle contract", () => {
  it("accepts an ascending closed series and exposes stable candle identity", () => {
    const candles = [
      validCandle(),
      validCandle({
        openTime: OPEN_TIME + HOUR,
        closeTime: OPEN_TIME + 2 * HOUR - 1
      })
    ];

    expect(() => assertHistoricalCandleSeries(candles)).not.toThrow();
    const firstCandle = candles[0];
    if (firstCandle === undefined) {
      throw new Error("The candle contract fixture requires one candle.");
    }
    expect(candleIdentity(firstCandle)).toBe(`binance|BTCUSDT|1h|${OPEN_TIME}`);
  });

  it.each([
    ["CANDLE_OPEN_TIME_ALIGNMENT", { openTime: OPEN_TIME + 1 }],
    ["CANDLE_CLOSE_TIME_ALIGNMENT", { closeTime: OPEN_TIME + HOUR }],
    ["CANDLE_PRICE_FINITE", { open: Number.NaN }],
    ["CANDLE_PRICE_POSITIVE", { low: 0 }],
    ["CANDLE_OHLC_HIGH", { high: 104 }],
    ["CANDLE_OHLC_LOW", { low: 106 }],
    ["CANDLE_VOLUME_NON_NEGATIVE", { volume: -1 }],
    ["CANDLE_NOT_CLOSED", { closed: false }],
    ["CANDLE_REVISION", { revision: 0 }]
  ] as const)("names the violated rule %s", (rule, overrides) => {
    expect(() => assertHistoricalCandleSeries([validCandle(overrides)])).toThrow(rule);
  });

  it("rejects duplicate or descending candle identities", () => {
    const duplicate = validCandle();

    expect(() => assertHistoricalCandleSeries([duplicate, duplicate])).toThrow(
      "CANDLE_SERIES_ORDER"
    );
  });

  it("maps every accepted timeframe to its exact millisecond duration", () => {
    expect(timeframeDurationMs("1m")).toBe(60_000);
    expect(timeframeDurationMs("5m")).toBe(300_000);
    expect(timeframeDurationMs("15m")).toBe(900_000);
    expect(timeframeDurationMs("30m")).toBe(1_800_000);
    expect(timeframeDurationMs("1h")).toBe(3_600_000);
    expect(timeframeDurationMs("2h")).toBe(7_200_000);
    expect(timeframeDurationMs("4h")).toBe(14_400_000);
    expect(timeframeDurationMs("1d")).toBe(86_400_000);
  });
});
