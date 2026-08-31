// PostgreSQL adapter for the NEWS-07 read-only query surface: item list, sentiment
// distribution, and collection/analysis health. News-owned; other modules never read
// the `news` schema directly.

import type { Pool } from "pg";
import type { NewsItemListRequest, NewsItemPage, NewsItemQuery } from "../application/news-item-query.js";
import {
  computeSentimentProportions,
  type SentimentDistribution,
  type SentimentDistributionQuery,
  type SentimentDistributionWindow
} from "../application/sentiment-distribution-query.js";
import {
  deriveAnalysisHealth,
  type NewsAnalysisStateCounts,
  type NewsHealthQuery,
  type NewsHealthSnapshot,
  type NewsHealthStatus,
  type NewsSourceHealth
} from "../application/news-health-query.js";
import type { NewsAnalysisState } from "../domain/news-item.js";

interface ItemListRow {
  id: string;
  title: string;
  source: string;
  published_at: string;
  related_coins: string[];
  analysis_state: NewsAnalysisState;
  total_count: number;
}

interface DistributionRow {
  positive: number;
  neutral: number;
  negative: number;
}

interface SourceHealthRow {
  provider: string;
  status: NewsHealthStatus;
  reason: string | null;
  checked_at: string;
}

interface StateCountRow {
  analysis_state: NewsAnalysisState;
  count: number;
}

const EMPTY_STATE_COUNTS: NewsAnalysisStateCounts = { pending: 0, analyzing: 0, analyzed: 0, degraded: 0 };

export class PostgresNewsQueryRepository
  implements NewsItemQuery, SentimentDistributionQuery, NewsHealthQuery {
  constructor(private readonly pool: Pool) {}

  async list(request: NewsItemListRequest): Promise<NewsItemPage> {
    const offset = (request.pageNumber - 1) * request.pageSize;
    const result = await this.pool.query<ItemListRow>(
      `
        SELECT id, title, source, published_at, related_coins, analysis_state,
               count(*) OVER ()::int AS total_count
        FROM news.items
        ORDER BY published_at DESC, id ASC
        LIMIT $1 OFFSET $2
      `,
      [request.pageSize, offset]
    );
    const totalCount = result.rows[0]?.total_count ?? (await this.countItems());
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        source: row.source,
        publishedAt: Number(row.published_at),
        relatedCoins: row.related_coins,
        analysisState: row.analysis_state
      })),
      page: { pageNumber: request.pageNumber, pageSize: request.pageSize, totalCount }
    };
  }

  private async countItems(): Promise<number> {
    const result = await this.pool.query<{ count: number }>("SELECT count(*)::int AS count FROM news.items");
    return result.rows[0]?.count ?? 0;
  }

  async getDistribution(window: SentimentDistributionWindow): Promise<SentimentDistribution> {
    const result = await this.pool.query<DistributionRow>(
      `
        SELECT
          count(*) FILTER (WHERE r.label = 'positive')::int AS positive,
          count(*) FILTER (WHERE r.label = 'neutral')::int AS neutral,
          count(*) FILTER (WHERE r.label = 'negative')::int AS negative
        FROM news.items i
        JOIN news.sentiment_results r ON r.news_item_id = i.id AND r.status = 'succeeded'
        WHERE i.analysis_state = 'analyzed' AND i.published_at >= $1 AND i.published_at <= $2
      `,
      [window.startAt, window.endAt]
    );
    const counts = result.rows[0] ?? { positive: 0, neutral: 0, negative: 0 };
    const proportions = computeSentimentProportions(counts);
    return {
      window,
      itemCount: counts.positive + counts.neutral + counts.negative,
      ...proportions
    };
  }

  async getHealth(): Promise<NewsHealthSnapshot> {
    const [sourceHealth, stateCounts, lastCompleted] = await Promise.all([
      this.pool.query<SourceHealthRow>(
        "SELECT provider, status, reason, checked_at FROM news.source_health ORDER BY provider"
      ),
      this.pool.query<StateCountRow>(
        "SELECT analysis_state, count(*)::int AS count FROM news.items GROUP BY analysis_state"
      ),
      this.pool.query<{ last_completed_at: Date | null }>(
        "SELECT max(completed_at) AS last_completed_at FROM news.sentiment_analysis_attempts"
      )
    ]);

    const collection: NewsSourceHealth[] = sourceHealth.rows.map((row) => ({
      provider: row.provider,
      status: row.status,
      checkedAt: Number(row.checked_at),
      ...(row.reason === null ? {} : { reason: row.reason })
    }));

    const counts = stateCounts.rows.reduce<NewsAnalysisStateCounts>(
      (accumulated, row) => ({ ...accumulated, [row.analysis_state]: row.count }),
      EMPTY_STATE_COUNTS
    );
    const lastCompletedAt = lastCompleted.rows[0]?.last_completed_at ?? null;
    const analysis = deriveAnalysisHealth(counts, lastCompletedAt === null ? null : lastCompletedAt.getTime());

    return { collection, analysis };
  }
}
