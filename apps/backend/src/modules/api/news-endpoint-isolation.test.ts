// Proves NEWS-07 acceptance criterion 6: each isolated News read can fail while
// sibling Market, backtest, and discovery controllers still complete normally.
// Their ports are separately bound in api.module.ts and share no News query state.

import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { ApiCandle } from "@crypto-strategy-lab/api-contracts";
import {
  BacktestResultQuery,
  BacktestRunService,
  ProvenanceQuery,
  SearchAnnotationRecompute,
  SearchExperimentHost
} from "../experiment/index.js";
import { MARKET_DATA_QUERY, type MarketDataQuery } from "../market/index.js";
import { NEWS_HEALTH_QUERY, NEWS_ITEM_QUERY, SENTIMENT_DISTRIBUTION_QUERY } from "../news/index.js";
import { BacktestController } from "./backtest.controller.js";
import { CandleHistoryController } from "./candle-history.controller.js";
import { CandleHistoryQueryDto } from "./candle-history.dto.js";
import { NewsController } from "./news.controller.js";
import { NewsItemListQueryDto, NewsSentimentDistributionQueryDto } from "./news.dto.js";
import { SearchController } from "./search.controller.js";

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

function sentimentDistributionQuery(): NewsSentimentDistributionQueryDto {
  const dto = new NewsSentimentDistributionQueryDto();
  dto.startAt = 0;
  dto.endAt = 0;
  return dto;
}

describe("News endpoint failure isolation (NEWS-07 AC6)", () => {
  it("keeps Market, backtest, and discovery controller paths usable when each News read fails", async () => {
    const candle: ApiCandle = {
      provider: "binance", symbol: "BTCUSDT", timeframe: "1h",
      openTime: 0, closeTime: 3_600_000, open: 1, high: 1, low: 1, close: 1,
      volume: 0, closed: true, revision: 1
    };
    const getCandles = vi.fn(async () => [candle]);
    const marketData: Partial<MarketDataQuery> = { getCandles };
    const failure = new Error("NEWS_QUERY_UNAVAILABLE: simulated failure");

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NewsController, CandleHistoryController, BacktestController, SearchController],
      providers: [
        { provide: MARKET_DATA_QUERY, useValue: marketData },
        { provide: NEWS_ITEM_QUERY, useValue: { list: () => Promise.reject(failure) } },
        { provide: SENTIMENT_DISTRIBUTION_QUERY, useValue: { getDistribution: () => Promise.reject(failure) } },
        { provide: NEWS_HEALTH_QUERY, useValue: { getHealth: () => Promise.reject(failure) } },
        {
          provide: BacktestRunService,
          useValue: {
            start: vi.fn(async () => ({
              runId: "10000000-0000-4000-8000-000000000001",
              specId: "10000000-0000-4000-8000-000000000002",
              candidateId: "single", idempotencyKey: "key", status: "queued",
              createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z"
            }))
          }
        },
        { provide: BacktestResultQuery, useValue: {} },
        { provide: ProvenanceQuery, useValue: {} },
        { provide: SearchAnnotationRecompute, useValue: {} },
        {
          provide: SearchExperimentHost,
          useValue: {
            begin: vi.fn(async () => ({
              status: "running", stopReason: null, generated: 0, submitted: 0,
              completed: 0, failed: 0, cancelled: 0, inFlight: 0
            }))
          }
        }
      ]
    }).compile();

    const news = module.get(NewsController);
    const chart = module.get(CandleHistoryController);
    const backtests = module.get(BacktestController);
    const discovery = module.get(SearchController);

    await expect(news.listItems(itemListQuery())).rejects.toThrow(failure);
    await expect(news.getSentimentDistribution(sentimentDistributionQuery())).rejects.toThrow(failure);
    await expect(news.getHealth()).rejects.toThrow(failure);
    await expect(chart.getCandles(candleHistoryQuery())).resolves.toEqual({ candles: [candle] });
    await expect(backtests.start({ specId: "10000000-0000-4000-8000-000000000002" } as never))
      .resolves.toMatchObject({ status: "queued" });
    await expect(discovery.start("10000000-0000-4000-8000-000000000003"))
      .resolves.toMatchObject({ status: "running" });
    expect(getCandles).toHaveBeenCalledOnce();
  });
});
