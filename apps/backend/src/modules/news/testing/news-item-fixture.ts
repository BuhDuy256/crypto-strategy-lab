// Deterministic normalized NewsItem builder shared by News analyzer and lifecycle tests.
import { normalizeNewsItem, type NewsItem } from "../domain/news-item.js";

export interface NewsItemFixtureOverrides {
  readonly title?: string;
  readonly content?: string;
  readonly url?: string;
  readonly source?: string;
  readonly relatedCoins?: readonly string[];
}

const DEFAULT_COLLECTED_AT = Date.UTC(2026, 7, 30, 1, 0, 0);

/** Builds one fully normalized NewsItem or throws, so tests never assert on malformed input. */
export function newsItemFixture(overrides: NewsItemFixtureOverrides = {}): NewsItem {
  const result = normalizeNewsItem({
    title: overrides.title ?? "CoinDesk fixture headline",
    content: overrides.content ?? "A recorded RSS summary.",
    source: overrides.source ?? "coindesk-rss",
    publishedAt: "2026-08-30T00:15:00Z",
    collectedAt: DEFAULT_COLLECTED_AT,
    relatedCoins: overrides.relatedCoins ?? [],
    url: overrides.url ?? "https://www.coindesk.com/fixture/first"
  });
  if (result.kind === "rejected") {
    throw new Error(`News item fixture must be valid: ${result.reason}`);
  }
  return result.item;
}
