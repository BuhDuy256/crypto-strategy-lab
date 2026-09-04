// News-owned paginated item list read for the NEWS-07 query surface.

import type { NewsAnalysisState } from "../domain/news-item.js";

export interface NewsItemSummary {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly publishedAt: number;
  readonly relatedCoins: readonly string[];
  readonly analysisState: NewsAnalysisState;
}

export interface NewsItemPage {
  readonly items: readonly NewsItemSummary[];
  readonly page: { readonly pageNumber: number; readonly pageSize: number; readonly totalCount: number };
}

export interface NewsItemListRequest {
  readonly pageNumber: number;
  readonly pageSize: number;
}

export interface NewsItemQuery {
  list(request: NewsItemListRequest): Promise<NewsItemPage>;
}
