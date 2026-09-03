// Deterministic in-memory NewsProvider for conformance and downstream tests.
import type { NewsItem } from "../domain/news-item.js";
import {
  NewsProviderError,
  type NewsProvider,
  type NewsProviderHealth
} from "../application/news-provider.js";

export interface FakeNewsProviderOptions {
  readonly providerId: string;
  readonly items: readonly NewsItem[];
  readonly checkedAt: number;
  readonly unavailableReason?: string;
}

export class FakeNewsProvider implements NewsProvider {
  private readonly providerId: string;
  private readonly items: readonly NewsItem[];
  private readonly checkedAt: number;
  private readonly unavailableReason: string | undefined;

  constructor(options: FakeNewsProviderOptions) {
    this.providerId = options.providerId;
    this.items = options.items;
    this.checkedAt = options.checkedAt;
    this.unavailableReason = options.unavailableReason;
  }

  async fetchLatest(): Promise<readonly NewsItem[]> {
    if (this.unavailableReason !== undefined) {
      throw new NewsProviderError(
        "PROVIDER_UNAVAILABLE",
        this.providerId,
        this.unavailableReason
      );
    }
    return this.items;
  }

  async getHealth(): Promise<NewsProviderHealth> {
    if (this.unavailableReason !== undefined) {
      return {
        provider: this.providerId,
        status: "unavailable",
        checkedAt: this.checkedAt,
        reason: this.unavailableReason
      };
    }
    return {
      provider: this.providerId,
      status: "healthy",
      checkedAt: this.checkedAt
    };
  }
}
