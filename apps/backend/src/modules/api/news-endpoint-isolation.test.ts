// Proves NEWS-07 acceptance criterion 6: a failure inside a News read cannot affect
// the chart endpoint. NewsController and CandleHistoryController are bound to
// disjoint ports with no shared state (see api.module.ts), so a News query throwing
// must never stop a sibling Market controller, compiled in the very same module
// instance, from completing its own call normally.

import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { ApiCandle } from "@crypto-strategy-lab/api-contracts";
import { MARKET_DATA_QUERY, type MarketDataQuery } from "../market/index.js";
import { NEWS_HEALTH_QUERY, NEWS_ITEM_QUERY, SENTIMENT_DISTRIBUTION_QUERY } from "../news/index.js";
import { CandleHistoryController } from "./candle-history.controller.js";
import { CandleHistoryQueryDto } from "./candle-history.dto.js";
import { NewsController } from "./news.controller.js";
import { NewsItemListQueryDto } from "./news.dto.js";

function candleHistoryQuery(): CandleHistoryQueryDto {
  const dto = new CandleHistoryQueryDto();
  dto.provider = "binance";
  dto.symbol = "BTCUSDT";
  dto.timeframe = "1h";
  dto.startTime = 0;
  dto.endTime = 0;
  return dto;
}

function itemListQuery(): NewsItemListQueryDto {
  const dto = new NewsItemListQueryDto();
  dto.page = 1;
  dto.pageSize = 10;
  return dto;
}

describe("News endpoint failure isolation (NEWS-07 AC6)", () => {
  it("lets the chart endpoint succeed after every News read throws, in the same module instance", async () => {
    const candle: ApiCandle = {
      provider: "binance", symbol: "BTCUSDT", timeframe: "1h",
      openTime: 0, closeTime: 3_600_000, open: 1, high: 1, low: 1, close: 1,
      volume: 0, closed: true, revision: 1
    };
    const getCandles = vi.fn(async () => [candle]);
    const marketData: Partial<MarketDataQuery> = { getCandles };
    const failure = new Error("NEWS_QUERY_UNAVAILABLE: simulated failure");

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NewsController, CandleHistoryController],
      providers: [
        { provide: MARKET_DATA_QUERY, useValue: marketData },
        { provide: NEWS_ITEM_QUERY, useValue: { list: () => Promise.reject(failure) } },
        { provide: SENTIMENT_DISTRIBUTION_QUERY, useValue: { getDistribution: () => Promise.reject(failure) } },
        { provide: NEWS_HEALTH_QUERY, useValue: { getHealth: () => Promise.reject(failure) } }
      ]
    }).compile();

    const news = module.get(NewsController);
    const chart = module.get(CandleHistoryController);

    await expect(news.listItems(itemListQuery())).rejects.toThrow(failure);
    await expect(news.getHealth()).rejects.toThrow(failure);
    await expect(chart.getCandles(candleHistoryQuery())).resolves.toEqual({ candles: [candle] });
    expect(getCandles).toHaveBeenCalledOnce();
  });
});
