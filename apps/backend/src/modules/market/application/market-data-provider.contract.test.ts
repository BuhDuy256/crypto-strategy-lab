// Exercises the reusable provider suite against working and deliberately broken fakes.
import { describe, expect, it } from "vitest";
import { FakeMarketDataProvider } from "../testing/fake-market-data-provider.js";
import {
  defineMarketDataProviderContract,
  verifyHistoricalProviderResponse
} from "../testing/market-data-provider-contract.js";
import type { Candle } from "../domain/candle.js";
import { MarketDataProviderError, type MarketDataProvider } from "./market-data-provider.js";

const HOUR = 3_600_000;
const OPEN_TIME = Date.UTC(2026, 7, 1, 0, 0, 0);

const candles: readonly Candle[] = [
  {
    provider: "fake",
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
    revision: 1
  },
  {
    provider: "fake",
    symbol: "BTCUSDT",
    timeframe: "1h",
    openTime: OPEN_TIME + HOUR,
    closeTime: OPEN_TIME + 2 * HOUR - 1,
    open: 105,
    high: 112,
    low: 101,
    close: 108,
    volume: 10,
    closed: true,
    revision: 1
  }
];

const firstCandle = candles[0];
const secondCandle = candles[1];
if (firstCandle === undefined || secondCandle === undefined) {
  throw new Error("The market provider contract fixture requires two candles.");
}

defineMarketDataProviderContract("FakeMarketDataProvider", () => ({
  provider: new FakeMarketDataProvider({
    providerId: "fake",
    candles,
    supportedSymbols: ["BTCUSDT"],
    supportedTimeframes: ["1h"]
  }),
  supportedRequest: {
    symbol: "BTCUSDT",
    timeframe: "1h",
    startTime: OPEN_TIME,
    endTime: OPEN_TIME + 2 * HOUR - 1
  },
  unsupportedSymbolRequest: {
    symbol: "ETHUSDT",
    timeframe: "1h",
    startTime: OPEN_TIME,
    endTime: OPEN_TIME + HOUR - 1
  },
  unsupportedTimeframeRequest: {
    symbol: "BTCUSDT",
    timeframe: "5m",
    startTime: OPEN_TIME,
    endTime: OPEN_TIME + HOUR - 1
  }
}));

describe("FakeMarketDataProvider", () => {
  it("reports live subscription as an explicit unsupported capability", () => {
    const provider = new FakeMarketDataProvider({
      providerId: "fake",
      candles,
      supportedSymbols: ["BTCUSDT"],
      supportedTimeframes: ["1h"]
    });

    expect(() => provider.subscribeLive({ symbol: "BTCUSDT", timeframe: "1h" })).toThrow(
      expect.objectContaining<Partial<MarketDataProviderError>>({ code: "NOT_SUPPORTED" })
    );
  });

  it("returns no candles when a valid range contains no provider data", async () => {
    const provider = new FakeMarketDataProvider({
      providerId: "fake",
      candles,
      supportedSymbols: ["BTCUSDT"],
      supportedTimeframes: ["1h"]
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME + 10 * HOUR,
        endTime: OPEN_TIME + 11 * HOUR
      })
    ).resolves.toEqual([]);
  });

  it.each([
    ["CANDLE_OPEN_TIME_ALIGNMENT", [{ ...firstCandle, openTime: OPEN_TIME + 1 }]],
    ["CANDLE_CLOSE_TIME_ALIGNMENT", [{ ...firstCandle, closeTime: OPEN_TIME + HOUR }]],
    ["CANDLE_OHLC_HIGH", [{ ...firstCandle, high: 99 }]],
    ["CANDLE_OHLC_LOW", [{ ...firstCandle, low: 106 }]],
    ["CANDLE_VOLUME_NON_NEGATIVE", [{ ...firstCandle, volume: -1 }]],
    ["CANDLE_NOT_CLOSED", [{ ...firstCandle, closed: false }]],
    ["CANDLE_SERIES_ORDER", [firstCandle, firstCandle]],
    ["CANDLE_SERIES_ORDER", [secondCandle, firstCandle]]
  ] as const)("makes the shared contract checker reject %s", async (rule, response) => {
    const brokenProvider: MarketDataProvider = {
      async fetchHistorical() {
        return response;
      },
      subscribeLive() {
        throw new MarketDataProviderError("NOT_SUPPORTED", "broken", "not supported");
      },
      async getHealth() {
        return { provider: "broken", status: "healthy", checkedAt: OPEN_TIME };
      }
    };

    await expect(
      verifyHistoricalProviderResponse(brokenProvider, {
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).rejects.toThrow(rule);
  });
});
