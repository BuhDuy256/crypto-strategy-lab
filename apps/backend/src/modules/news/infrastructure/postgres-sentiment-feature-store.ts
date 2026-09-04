// Read-only PostgreSQL adapter for the News-owned sentiment feature seam.

import type { Pool } from "pg";
import type {
  SentimentFeatureStore,
  SentimentFeatureStoredResult
} from "../application/sentiment-feature.js";
import type { NewsAnalysisState, NewsItem } from "../domain/news-item.js";
import type { SentimentLabel, SentimentResult, SentimentResultStatus } from "../domain/sentiment-result.js";

interface SentimentFeatureRow {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly source: string;
  readonly published_at: string;
  readonly collected_at: string;
  readonly related_coins: string[];
  readonly url: string;
  readonly analysis_state: NewsAnalysisState;
  readonly schema_version: number;
  readonly news_item_id: string;
  readonly label: SentimentLabel;
  readonly score: number;
  readonly model_id: string;
  readonly model_artifact_id: string;
  readonly model_version: string;
  readonly input_version: string;
  readonly preprocessing_version: string;
  readonly analyzed_at: string;
  readonly status: SentimentResultStatus;
}

function mapRow(row: SentimentFeatureRow): SentimentFeatureStoredResult {
  const item: NewsItem = {
    id: row.id,
    title: row.title,
    content: row.content,
    source: row.source,
    publishedAt: Number(row.published_at),
    collectedAt: Number(row.collected_at),
    relatedCoins: row.related_coins,
    url: row.url,
    analysisState: row.analysis_state
  };
  const result: SentimentResult = {
    schemaVersion: row.schema_version,
    newsItemId: row.news_item_id,
    label: row.label,
    score: row.score,
    model: {
      modelId: row.model_id,
      modelArtifactId: row.model_artifact_id,
      modelVersion: row.model_version,
      inputVersion: row.input_version,
      preprocessingVersion: row.preprocessing_version
    },
    analyzedAt: Number(row.analyzed_at),
    status: row.status
  };
  return { item, result };
}

/** News alone queries its durable rows; callers receive the application port instead. */
export class PostgresSentimentFeatureStore implements SentimentFeatureStore {
  constructor(private readonly pool: Pool) {}

  async findInWindow(request: {
    readonly assetCode: string;
    readonly startAt: number;
    readonly endAt: number;
  }): Promise<readonly SentimentFeatureStoredResult[]> {
    const result = await this.pool.query<SentimentFeatureRow>(
      `SELECT i.id, i.title, i.content, i.source, i.published_at, i.collected_at,
              i.related_coins, i.url, i.analysis_state, r.schema_version,
              r.news_item_id, r.label, r.score, r.model_id, r.model_artifact_id,
              r.model_version, r.input_version, r.preprocessing_version,
              r.analyzed_at, r.status
       FROM news.sentiment_results r
       JOIN news.items i ON i.id = r.news_item_id
       WHERE i.analysis_state = 'analyzed' AND r.status = 'succeeded'
         AND i.related_coins ? $1
         AND i.published_at >= $2 AND i.published_at <= $3
       ORDER BY i.published_at, r.news_item_id`,
      [request.assetCode, request.startAt, request.endAt]
    );
    return result.rows.map(mapRow);
  }
}
