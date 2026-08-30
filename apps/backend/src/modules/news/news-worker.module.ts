// Narrow composition root for the News collection worker process only.

import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { createDatabasePool } from "../../platform/database.js";
import { loadConfig } from "../../platform/config.js";
import { StructuredLogger } from "../../platform/logger.js";
import { NewsCollectionScheduler, NewsCollectionService } from "./application/news-collection-service.js";
import { NewsWorkerRuntime } from "./application/news-worker-runtime.js";
import { CoinDeskRssNewsProvider } from "./infrastructure/coindesk-rss-news-provider.js";
import { PostgresNewsCollectionRepository } from "./infrastructure/postgres-news-collection-repository.js";

export const NEWS_WORKER_DATABASE_POOL = Symbol("NEWS_WORKER_DATABASE_POOL");
export const NEWS_WORKER_LOGGER = Symbol("NEWS_WORKER_LOGGER");

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
      provide: NewsWorkerRuntime,
      inject: [NewsCollectionScheduler, NEWS_WORKER_LOGGER],
      useFactory: (schedule: NewsCollectionScheduler, logger: StructuredLogger): NewsWorkerRuntime =>
        new NewsWorkerRuntime(schedule, logger)
    },
    NewsWorkerDatabaseLifecycle
  ],
  exports: [NewsWorkerRuntime]
})
export class NewsWorkerModule {}
