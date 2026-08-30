// Public surface of the News Intelligence module.
export { NewsModule } from "./news.module.js";
export {
  MAX_NEWS_CONTENT_LENGTH,
  assertNewsItemCollection,
  assertNormalizedNewsItem,
  deduplicateNewsItems,
  normalizeNewsItem,
  type NewsAnalysisState,
  type NewsItem,
  type NewsItemNormalizationResult,
  type NewsItemRejectionReason
} from "./domain/news-item.js";
export { NewsProviderError, type NewsProvider } from "./application/news-provider.js";
export type {
  NewsProviderErrorCode,
  NewsProviderHealth,
  NewsProviderHealthStatus
} from "./application/news-provider.js";
