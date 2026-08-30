// News Intelligence's external-provider seam.
// Provider payloads stay behind adapters; callers receive normalized NewsItem values only.
import type { NewsItem } from "../domain/news-item.js";

export type NewsProviderHealthStatus = "healthy" | "degraded" | "unavailable";

export interface NewsProviderHealth {
  readonly provider: string;
  readonly status: NewsProviderHealthStatus;
  /** Unix epoch milliseconds in UTC. */
  readonly checkedAt: number;
  readonly reason?: string;
}

export type NewsProviderErrorCode = "PROVIDER_UNAVAILABLE" | "INVALID_PROVIDER_DATA";

export class NewsProviderError extends Error {
  override readonly name = "NewsProviderError";

  constructor(
    readonly code: NewsProviderErrorCode,
    readonly provider: string,
    message: string
  ) {
    super(message);
  }
}

export interface NewsProvider {
  /** Returns unique, fully normalized NewsItem values from the provider. */
  fetchLatest(): Promise<readonly NewsItem[]>;
  getHealth(): Promise<NewsProviderHealth>;
}
