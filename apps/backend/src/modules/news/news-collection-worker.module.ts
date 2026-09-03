// Composition root for a manual News collection process with no analyzer graph.

import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { createDatabasePool } from "../../platform/database.js";
import { loadConfig } from "../../platform/config.js";
import { StructuredLogger } from "../../platform/logger.js";
import {
  NewsCollectionScheduler,
  type NewsCollectionResult,
  NewsCollectionService
} from "./application/news-collection-service.js";
import { CoinDeskRssNewsProvider } from "./infrastructure/coindesk-rss-news-provider.js";
import { PostgresNewsCollectionRepository } from "./infrastructure/postgres-news-collection-repository.js";

export const NEWS_COLLECTION_WORKER_DATABASE_POOL = Symbol("NEWS_COLLECTION_WORKER_DATABASE_POOL");
export const NEWS_COLLECTION_WORKER_LOGGER = Symbol("NEWS_COLLECTION_WORKER_LOGGER");

const PROCESS_ROLE = "news-worker";

class NewsCollectionWorkerDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(NEWS_COLLECTION_WORKER_DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

/** Runs the existing collection scheduler without constructing sentiment-analysis dependencies. */
export class NewsCollectionWorkerRuntime {
  constructor(
    private readonly schedule: NewsCollectionScheduler,
    private readonly logger: StructuredLogger
  ) {}

  async collectOnce(): Promise<NewsCollectionResult> {
    const result = await this.schedule.collectManually();
    this.logger.log(
      `Manual News collection is ${result.status}: ${result.storedCount} stored, ${result.skippedCount} skipped.`,
      "NewsWorker"
    );
    return result;
  }
}

@Module({
  providers: [
    {
      provide: NEWS_COLLECTION_WORKER_LOGGER,
      useFactory: (): StructuredLogger => new StructuredLogger(PROCESS_ROLE)
    },
    {
      provide: NEWS_COLLECTION_WORKER_DATABASE_POOL,
      useFactory: (): Pool => createDatabasePool(loadConfig().postgres)
    },
    {
      provide: PostgresNewsCollectionRepository,
      inject: [NEWS_COLLECTION_WORKER_DATABASE_POOL],
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
      inject: [CoinDeskRssNewsProvider, PostgresNewsCollectionRepository, NEWS_COLLECTION_WORKER_LOGGER],
      useFactory: (
        provider: CoinDeskRssNewsProvider,
        store: PostgresNewsCollectionRepository,
        logger: StructuredLogger
      ): NewsCollectionService => new NewsCollectionService(provider, store, logger)
    },
    {
      provide: NewsCollectionScheduler,
      inject: [NewsCollectionService, NEWS_COLLECTION_WORKER_LOGGER],
      useFactory: (collector: NewsCollectionService, logger: StructuredLogger): NewsCollectionScheduler =>
        new NewsCollectionScheduler(collector, loadConfig().news.coinDeskRss.pollIntervalMs, undefined, logger)
    },
    {
      provide: NewsCollectionWorkerRuntime,
      inject: [NewsCollectionScheduler, NEWS_COLLECTION_WORKER_LOGGER],
      useFactory: (
        schedule: NewsCollectionScheduler,
        logger: StructuredLogger
      ): NewsCollectionWorkerRuntime => new NewsCollectionWorkerRuntime(schedule, logger)
    },
    NewsCollectionWorkerDatabaseLifecycle
  ],
  exports: [
    NEWS_COLLECTION_WORKER_DATABASE_POOL,
    NEWS_COLLECTION_WORKER_LOGGER,
    NewsCollectionScheduler,
    NewsCollectionWorkerRuntime
  ]
})
export class NewsCollectionWorkerModule {}
