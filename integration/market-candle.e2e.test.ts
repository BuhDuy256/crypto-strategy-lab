// End-to-end proof from the SPA typed client through NestJS to PostgreSQL candles.

import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getCandleHistory } from "../apps/web/src/api/client.js";
import { ApiModule } from "../apps/backend/src/modules/api/index.js";
import {
  MARKET_DATA_PROVIDER,
  MarketBackfillService,
  type Candle
} from "../apps/backend/src/modules/market/index.js";
import { resetTestDatabase } from "../apps/backend/src/platform/test-database.js";

const HOUR = 3_600_000;
const START = Date.UTC(2026, 7, 1);
const nativeFetch = globalThis.fetch;

const storedCandle: Candle = {
  provider: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  openTime: START,
  closeTime: START + HOUR - 1,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 12,
  closed: true,
  revision: 1
};

describe("market candle vertical slice", () => {
  let pool: Pool;
  let application: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    const module = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(MARKET_DATA_PROVIDER)
      .useValue({ fetchHistorical: async () => [storedCandle] })
      .compile();
    application = module.createNestApplication();
    application.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await application
      .get(MarketBackfillService)
      .backfill({ symbol: "BTCUSDT", timeframe: "1h", startTime: START, endTime: START });
    await application.listen(0, "127.0.0.1");
    baseUrl = await application.getUrl();
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (typeof input !== "string" || !input.startsWith("/api")) {
        return nativeFetch(input, init);
      }
      return nativeFetch(`${baseUrl}${input.slice("/api".length)}`, init);
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await application?.close();
    await pool?.end();
  });

  it("returns the PostgreSQL candle through the SPA typed client", async () => {
    const response = await getCandleHistory({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: START,
      endTime: START
    });
    expect(response).toEqual({ candles: [storedCandle] });
  });

  it.each([
    ["provider=other&symbol=BTCUSDT&timeframe=1h", "provider"],
    ["provider=binance&symbol=ETHUSDT&timeframe=1h", "symbol"],
    ["provider=binance&symbol=BTCUSDT&timeframe=3m", "timeframe"],
    [`provider=binance&symbol=BTCUSDT&timeframe=1h&startTime=${START + HOUR}&endTime=${START}`, "startTime"],
    [`provider=binance&symbol=BTCUSDT&timeframe=1m&startTime=${START}&endTime=${START + 10_000 * 60_000}`, "10000"]
  ])("rejects an invalid query: %s", async (query, expectedMessage) => {
    const withTimes = query.includes("startTime") ? query : `${query}&startTime=${START}&endTime=${START}`;
    const response = await nativeFetch(`${baseUrl}/market/candles?${withTimes}`);
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(expectedMessage);
  });
});
