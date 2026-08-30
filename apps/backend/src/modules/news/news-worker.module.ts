// Narrow composition root for the News collection worker process only.

import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { createDatabasePool } from "../../platform/database.js";
import { loadConfig } from "../../platform/config.js";
import { StructuredLogger } from "../../platform/logger.js";
import type { SentimentAnalyzer } from "./application/sentiment-analyzer.js";
import { NewsCollectionScheduler, NewsCollectionService } from "./application/news-collection-service.js";
import {
  SentimentAnalysisScheduler,
  SentimentAnalysisService
} from "./application/sentiment-analysis-service.js";
import { NewsWorkerRuntime } from "./application/news-worker-runtime.js";
import { CoinDeskRssNewsProvider } from "./infrastructure/coindesk-rss-news-provider.js";
import { PostgresNewsCollectionRepository } from "./infrastructure/postgres-news-collection-repository.js";
import { PostgresSentimentAnalysisRepository } from "./infrastructure/postgres-sentiment-analysis-repository.js";
// NEWS-03 binds a fake analyzer on purpose: no real model is selected yet, and the
// lifecycle must not depend on one. NEWS-04 replaces this single line.
import { FakeLexiconSentimentAnalyzer } from "./testing/fake-sentiment-analyzer.js";

export const NEWS_WORKER_DATABASE_POOL = Symbol("NEWS_WORKER_DATABASE_POOL");
export const NEWS_WORKER_LOGGER = Symbol("NEWS_WORKER_LOGGER");
/** The one binding NEWS-04 changes when a real analyzer is chosen. */
export const SENTIMENT_ANALYZER = Symbol("SENTIMENT_ANALYZER");

const PROCESS_ROLE = "news-worker";

class NewsWorkerDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(NEWS_WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: NEWS_WORKER_LOGGER,
      useFactory: (): StructuredLogger => new StructuredLogger(PROCESS_ROLE)
    },
    {
      provide: NEWS_WORKER_DATABASE_POOL,
      useFactory: (): Pool => createDatabasePool(loadConfig().postgres)
    },
    {
      provide: PostgresNewsCollectionRepository,
      inject: [NEWS_WORKER_DATABASE_POOL],
      useFactory: (pool: Pool): PostgresNewsCollectionRepository =>
        new PostgresNewsCollectionRepository(pool)
    },
    {
      provide: CoinDeskRssNewsProvider,
      useFactory: (): CoinDeskRssNewsProvider => {
        const config = loadConfig().news.coinDeskRss;
        return new CoinDeskRssNewsProvider(config);
      }
    },
    {
      provide: NewsCollectionService,
      inject: [CoinDeskRssNewsProvider, PostgresNewsCollectionRepository, NEWS_WORKER_LOGGER],
      useFactory: (
        provider: CoinDeskRssNewsProvider,
        store: PostgresNewsCollectionRepository,
        logger: StructuredLogger
      ): NewsCollectionService => new NewsCollectionService(provider, store, logger)
    },
    {
      provide: NewsCollectionScheduler,
      inject: [NewsCollectionService],
      useFactory: (collector: NewsCollectionService): NewsCollectionScheduler =>
        new NewsCollectionScheduler(collector, loadConfig().news.coinDeskRss.pollIntervalMs)
    },
    {
      provide: PostgresSentimentAnalysisRepository,
      inject: [NEWS_WORKER_DATABASE_POOL],
      useFactory: (pool: Pool): PostgresSentimentAnalysisRepository =>
        new PostgresSentimentAnalysisRepository(pool, {
          leaseSeconds: loadConfig().news.sentimentAnalysis.leaseSeconds
        })
    },
    {
      provide: SENTIMENT_ANALYZER,
      useFactory: (): SentimentAnalyzer => new FakeLexiconSentimentAnalyzer()
    },
    {
      provide: SentimentAnalysisService,
      inject: [SENTIMENT_ANALYZER, PostgresSentimentAnalysisRepository, NEWS_WORKER_LOGGER],
      useFactory: (
        analyzer: SentimentAnalyzer,
        store: PostgresSentimentAnalysisRepository,
        logger: StructuredLogger
      ): SentimentAnalysisService => {
        const policy = loadConfig().news.sentimentAnalysis;
        return new SentimentAnalysisService(
          analyzer,
          store,
          { maxAttempts: policy.maxAttempts, batchSize: policy.batchSize },
          `${PROCESS_ROLE}-${process.pid}`,
          logger
        );
      }
    },
    {
      provide: SentimentAnalysisScheduler,
      inject: [SentimentAnalysisService],
      useFactory: (stage: SentimentAnalysisService): SentimentAnalysisScheduler =>
        new SentimentAnalysisScheduler(
          stage,
          loadConfig().news.sentimentAnalysis.pollIntervalMs
        )
    },
    {
      provide: NewsWorkerRuntime,
      inject: [NewsCollectionScheduler, SentimentAnalysisScheduler, NEWS_WORKER_LOGGER],
      useFactory: (
        schedule: NewsCollectionScheduler,
        analysis: SentimentAnalysisScheduler,
        logger: StructuredLogger
      ): NewsWorkerRuntime => new NewsWorkerRuntime(schedule, analysis, logger)
    },
    NewsWorkerDatabaseLifecycle
  ],
  exports: [NewsWorkerRuntime]
})
export class NewsWorkerModule {}
