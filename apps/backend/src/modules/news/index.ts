// Public surface of the News Intelligence module.
export { NewsModule } from "./news.module.js";
export {
  NewsCollectionWorkerModule,
  NewsCollectionWorkerRuntime
} from "./news-collection-worker.module.js";
export { NewsWorkerModule } from "./news-worker.module.js";
export { NewsWorkerRuntime } from "./application/news-worker-runtime.js";
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
export {
  MODEL_ALIASES_FORBIDDEN_IN_PROVENANCE,
  NEWS_SENTIMENT_INPUT_VERSION,
  SENTIMENT_LABELS,
  SENTIMENT_RESULT_SCHEMA_VERSION,
  normalizeSentimentResult,
  type SentimentLabel,
  type SentimentModelProvenance,
  type SentimentResult,
  type SentimentResultRejectionReason,
  type SentimentResultStatus
} from "./domain/sentiment-result.js";
export {
  SentimentAnalyzerError,
  type SentimentAnalysisInput,
  type SentimentAnalysisOutput,
  type SentimentAnalyzer,
  type SentimentAnalyzerErrorCode
} from "./application/sentiment-analyzer.js";
export {
  assertSentimentFeaturePolicy,
  createSentimentWindowIdentity,
  SentimentFeatureService,
  SIGNED_MEAN_V1
} from "./application/sentiment-feature.js";
export type {
  SentimentFeature,
  SentimentFeaturePolicy,
  SentimentFeaturePolicyAction,
  SentimentFeatureProvenance,
  SentimentFeatureRequest,
  SentimentFeatureResponse,
  SentimentFeatureSnapshot,
  SentimentFeatureStore,
  SentimentFeatureStoredResult,
  SentimentFeatureWindow,
  SentimentWindowIdentityInput
} from "./application/sentiment-feature.js";
