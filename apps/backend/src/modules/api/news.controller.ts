// Thin HTTP transport for the NEWS-07 read surface: paginated item list, windowed
// sentiment distribution, and collection/analysis health. All composition and
// aggregation belong to News; this controller validates, delegates, and returns.

import { BadRequestException, Controller, Get, Inject, Query, ValidationPipe } from "@nestjs/common";
import type {
  NewsHealthResponse,
  NewsItemListResponse,
  NewsSentimentDistributionResponse
} from "@crypto-strategy-lab/api-contracts";
import {
  NEWS_HEALTH_QUERY,
  NEWS_ITEM_QUERY,
  SENTIMENT_DISTRIBUTION_QUERY,
  type NewsHealthQuery,
  type NewsHealthSnapshot,
  type NewsItemQuery,
  type SentimentDistributionQuery
} from "../news/index.js";
import { NewsItemListQueryDto, NewsSentimentDistributionQueryDto } from "./news.dto.js";

function toNewsHealthResponse(snapshot: NewsHealthSnapshot): NewsHealthResponse {
  return {
    collection: snapshot.collection.map((entry) => ({
      status: entry.status,
      checkedAt: entry.checkedAt,
      ...(entry.message === undefined ? {} : { message: entry.message })
    })),
    analysis: {
      status: snapshot.analysis.status,
      pendingCount: snapshot.analysis.pendingCount,
      degradedCount: snapshot.analysis.degradedCount,
      checkedAt: snapshot.analysis.checkedAt,
      ...(snapshot.analysis.message === undefined ? {} : { message: snapshot.analysis.message })
    }
  };
}

@Controller("news")
export class NewsController {
  constructor(
    @Inject(NEWS_ITEM_QUERY) private readonly items: NewsItemQuery,
    @Inject(SENTIMENT_DISTRIBUTION_QUERY) private readonly distribution: SentimentDistributionQuery,
    @Inject(NEWS_HEALTH_QUERY) private readonly health: NewsHealthQuery
  ) {}

  @Get("items")
  async listItems(
    @Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, expectedType: NewsItemListQueryDto }))
    query: NewsItemListQueryDto
  ): Promise<NewsItemListResponse> {
    return this.items.list({ pageNumber: query.page, pageSize: query.pageSize });
  }

  @Get("sentiment")
  async getSentimentDistribution(
    @Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, expectedType: NewsSentimentDistributionQueryDto }))
    query: NewsSentimentDistributionQueryDto
  ): Promise<NewsSentimentDistributionResponse> {
    if (query.startAt > query.endAt) {
      throw new BadRequestException("startAt must be less than or equal to endAt");
    }
    return this.distribution.getDistribution({ startAt: query.startAt, endAt: query.endAt });
  }

  @Get("health")
  async getHealth(): Promise<NewsHealthResponse> {
    return toNewsHealthResponse(await this.health.getHealth());
  }
}
