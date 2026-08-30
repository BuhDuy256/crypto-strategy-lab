// Verifies Binance REST behavior through the provider port with offline HTTP fixtures.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MarketDataProviderError } from "../application/market-data-provider.js";
import type { Timeframe } from "../domain/candle.js";
import { defineMarketDataProviderContract } from "../testing/market-data-provider-contract.js";
import type { BinanceHttpClient, BinanceHttpResponse } from "./binance-http-client.js";
import { BinanceMarketDataProvider } from "./binance-market-data-provider.js";

const HOUR = 3_600_000;
const OPEN_TIME = Date.UTC(2026, 7, 1, 0, 0, 0);
const recordedKlines: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/binance-rest-klines.json", import.meta.url), "utf8")
);

class FixtureHttpClient implements BinanceHttpClient {
  readonly urls: URL[] = [];

  constructor(
    private readonly respond: (url: URL) => BinanceHttpResponse | Promise<BinanceHttpResponse>
  ) {}

  async get(url: URL): Promise<BinanceHttpResponse> {
    this.urls.push(url);
    return this.respond(url);
  }
}

function successfulResponse(body: unknown): BinanceHttpResponse {
  return { status: 200, headers: new Headers(), body };
}

function kline(openTime: number): readonly unknown[] {
  return [
    openTime,
    "65000.10",
    "65500.20",
    "64800.30",
    "65350.75",
    "125.5",
    openTime + HOUR - 1,
    "8171250.25",
    480,
    "63.2",
    "4128250.10",
    "0"
  ];
}

defineMarketDataProviderContract("BinanceMarketDataProvider", () => ({
  provider: new BinanceMarketDataProvider({
    httpClient: new FixtureHttpClient(() => successfulResponse(recordedKlines)),
    now: () => OPEN_TIME + HOUR
  }),
  supportedRequest: {
    symbol: "BTCUSDT",
    timeframe: "1h",
    startTime: OPEN_TIME,
    endTime: OPEN_TIME + HOUR - 1
  },
  unsupportedSymbolRequest: {
    symbol: "ETHUSDT",
    timeframe: "1h",
    startTime: OPEN_TIME,
    endTime: OPEN_TIME + HOUR - 1
  },
  unsupportedTimeframeRequest: {
    symbol: "BTCUSDT",
    timeframe: "3m" as Timeframe,
    startTime: OPEN_TIME,
    endTime: OPEN_TIME + HOUR - 1
  }
}));

describe("BinanceMarketDataProvider", () => {
  it("maps a recorded 12-field kline into the normalized candle contract", async () => {
    const httpClient = new FixtureHttpClient(() => successfulResponse(recordedKlines));
    const provider = new BinanceMarketDataProvider({
      httpClient,
      now: () => OPEN_TIME + HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).resolves.toEqual([
      {
        provider: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        openTime: OPEN_TIME,
        closeTime: OPEN_TIME + HOUR - 1,
        open: 65_000.1,
        high: 65_500.2,
        low: 64_800.3,
        close: 65_350.75,
        volume: 125.5,
        closed: true,
        revision: 1
      }
    ]);
    expect(httpClient.urls[0]?.pathname).toBe("/api/v3/klines");
    expect(Object.fromEntries(httpClient.urls[0]?.searchParams ?? [])).toEqual({
      symbol: "BTCUSDT",
      interval: "1h",
      startTime: String(OPEN_TIME),
      endTime: String(OPEN_TIME + HOUR - 1),
      limit: "1000"
    });
  });

  it("pages a 1001-candle range without a duplicate or gap at the join", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => kline(OPEN_TIME + index * HOUR));
    const endTime = OPEN_TIME + 1000 * HOUR;
    const httpClient = new FixtureHttpClient((url) => {
      const pageStart = Number(url.searchParams.get("startTime"));
      const pageEnd = Number(url.searchParams.get("endTime"));
      return successfulResponse(
        rows
          .filter((row) => Number(row[0]) >= pageStart && Number(row[0]) <= pageEnd)
          .slice(0, 1000)
      );
    });
    const provider = new BinanceMarketDataProvider({
      httpClient,
      now: () => endTime + HOUR
    });

    const candles = await provider.fetchHistorical({
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: OPEN_TIME,
      endTime
    });

    expect(candles).toHaveLength(1001);
    expect(candles[999]?.openTime).toBe(OPEN_TIME + 999 * HOUR);
    expect(candles[1000]?.openTime).toBe(OPEN_TIME + 1000 * HOUR);
    expect(httpClient.urls).toHaveLength(2);
    expect(httpClient.urls[1]?.searchParams.get("startTime")).toBe(
      String(OPEN_TIME + 1000 * HOUR)
    );
  });

  it("translates invalid provider values into a contextual typed error", async () => {
    const invalidRow = [...kline(OPEN_TIME)];
    invalidRow[1] = "not-a-price";
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() => successfulResponse([invalidRow])),
      now: () => OPEN_TIME + HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataProviderError>>({
        name: "MarketDataProviderError",
        code: "INVALID_PROVIDER_DATA",
        provider: "binance",
        message: expect.stringContaining("BTCUSDT 1h") as unknown as string
      })
    );
  });

  it("backs off using Retry-After before retrying a rate-limited request", async () => {
    let requestCount = 0;
    const delays: number[] = [];
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() => {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            status: 429,
            headers: new Headers({ "Retry-After": "2" }),
            body: { code: -1003, msg: "Too much request weight used" }
          };
        }
        return successfulResponse(recordedKlines);
      }),
      now: () => OPEN_TIME + HOUR,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      }
    });

    const candles = await provider.fetchHistorical({
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: OPEN_TIME,
      endTime: OPEN_TIME + HOUR - 1
    });

    expect(candles).toHaveLength(1);
    expect(requestCount).toBe(2);
    expect(delays).toEqual([2000]);
  });

  it("translates a transport failure into provider unavailable", async () => {
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() => {
        throw new TypeError("fetch failed");
      }),
      now: () => OPEN_TIME + HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<MarketDataProviderError>>({
        code: "PROVIDER_UNAVAILABLE",
        provider: "binance",
        message: expect.stringContaining("BTCUSDT 1h") as unknown as string
      })
    );
  });

  it("omits a still-forming kline from historical results", async () => {
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() =>
        successfulResponse([kline(OPEN_TIME), kline(OPEN_TIME + HOUR)])
      ),
      now: () => OPEN_TIME + 2 * HOUR - 1
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR
      })
    ).resolves.toEqual([
      expect.objectContaining({
        openTime: OPEN_TIME,
        closed: true
      })
    ]);
  });

  it("rejects a malformed close time instead of treating it as a forming candle", async () => {
    const invalidRow = [...kline(OPEN_TIME)];
    invalidRow[6] = "not-a-time";
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() => successfulResponse([invalidRow])),
      now: () => OPEN_TIME + HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_DATA",
      provider: "binance"
    });
  });

  it("returns an empty series when Binance has no data in the requested range", async () => {
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() => successfulResponse([])),
      now: () => OPEN_TIME + HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).resolves.toEqual([]);
  });

  it("rejects non-string and non-number values at the provider boundary", async () => {
    const invalidRow = [...kline(OPEN_TIME)];
    invalidRow[5] = null;
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() => successfulResponse([invalidRow])),
      now: () => OPEN_TIME + HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_DATA",
      provider: "binance"
    });
  });

  it("rejects a gap between adjacent returned candles", async () => {
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() =>
        successfulResponse([kline(OPEN_TIME), kline(OPEN_TIME + 2 * HOUR)])
      ),
      now: () => OPEN_TIME + 3 * HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + 2 * HOUR
      })
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_DATA",
      provider: "binance"
    });
  });

  it("rejects a candle outside the inclusive requested open-time range", async () => {
    const provider = new BinanceMarketDataProvider({
      httpClient: new FixtureHttpClient(() => successfulResponse([kline(OPEN_TIME - HOUR)])),
      now: () => OPEN_TIME + HOUR
    });

    await expect(
      provider.fetchHistorical({
        symbol: "BTCUSDT",
        timeframe: "1h",
        startTime: OPEN_TIME,
        endTime: OPEN_TIME + HOUR - 1
      })
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_DATA",
      provider: "binance"
    });
  });
});
