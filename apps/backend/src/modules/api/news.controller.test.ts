// Transport tests for the NEWS-07 read endpoints. Query composition and
// aggregation belong to News; this controller only validates, delegates, and maps.

import { Test, type TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  NEWS_HEALTH_QUERY,
  NEWS_ITEM_QUERY,
  SENTIMENT_DISTRIBUTION_QUERY,
  type NewsHealthQuery,
  type NewsItemQuery,
  type SentimentDistributionQuery
} from "../news/index.js";
import { NewsController } from "./news.controller.js";
import { NewsItemListQueryDto, NewsSentimentDistributionQueryDto } from "./news.dto.js";

async function controllerWith(overrides: {
  items?: Partial<NewsItemQuery>;
  distribution?: Partial<SentimentDistributionQuery>;
  health?: Partial<NewsHealthQuery>;
}): Promise<NewsController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [NewsController],
    providers: [
      { provide: NEWS_ITEM_QUERY, useValue: overrides.items ?? {} },
      { provide: SENTIMENT_DISTRIBUTION_QUERY, useValue: overrides.distribution ?? {} },
      { provide: NEWS_HEALTH_QUERY, useValue: overrides.health ?? {} }
    ]
  }).compile();
  return module.get<NewsController>(NewsController);
}

function itemListDto(page: number, pageSize: number): NewsItemListQueryDto {
  const dto = new NewsItemListQueryDto();
  dto.page = page;
  dto.pageSize = pageSize;
  return dto;
}

function distributionDto(startAt: number, endAt: number): NewsSentimentDistributionQueryDto {
  const dto = new NewsSentimentDistributionQueryDto();
  dto.startAt = startAt;
  dto.endAt = endAt;
  return dto;
}

describe("NewsController", () => {
  it("delegates the item list read with the requested paging", async () => {
    const list = vi.fn(async () => ({
      items: [],
      page: { pageNumber: 2, pageSize: 5, totalCount: 0 }
    }));
    const controller = await controllerWith({ items: { list } });

    const response = await controller.listItems(itemListDto(2, 5));

    expect(list).toHaveBeenCalledWith({ pageNumber: 2, pageSize: 5 });
    expect(response.page).toEqual({ pageNumber: 2, pageSize: 5, totalCount: 0 });
  });

  it("delegates the sentiment distribution read for a valid window", async () => {
    const getDistribution = vi.fn(async () => ({
      window: { startAt: 1_000, endAt: 2_000 },
      itemCount: 0,
      positive: 0,
      neutral: 0,
      negative: 0
    }));
    const controller = await controllerWith({ distribution: { getDistribution } });

    await controller.getSentimentDistribution(distributionDto(1_000, 2_000));

    expect(getDistribution).toHaveBeenCalledWith({ startAt: 1_000, endAt: 2_000 });
  });

  it("rejects an inverted sentiment window before touching the query", async () => {
    const getDistribution = vi.fn();
    const controller = await controllerWith({ distribution: { getDistribution } });

    await expect(controller.getSentimentDistribution(distributionDto(2_000, 1_000)))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(getDistribution).not.toHaveBeenCalled();
  });

  it("returns the health snapshot as-is, with no aggregation of its own", async () => {
    const snapshot = {
      collection: [{ provider: "coindesk-rss", status: "healthy" as const, checkedAt: 1 }],
      analysis: { status: "healthy" as const, pendingCount: 0, degradedCount: 0, checkedAt: 1 }
    };
    const getHealth = vi.fn(async () => snapshot);
    const controller = await controllerWith({ health: { getHealth } });

    const response = await controller.getHealth();

    expect(response).toEqual(snapshot);
  });
});
