// NewsModule backs ARC-NEWS (News Intelligence).
//
// Owns news provider adapters, collection, normalization/deduplication,
// item/source persistence, sentiment analyzer/model adapters, inference
// lifecycle/failures, versioned sentiment results, and sentiment-feature
// queries (see architecture-baseline.md). This composition binds the
// read-only NEWS-07 query surface (item list, sentiment distribution,
// collection/analysis health) that the API process serves. Collection and
// analysis lifecycle wiring belongs to the separate news-worker processes
// (news-collection-worker.module.ts, news-worker.module.ts), never here.
import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { loadConfig } from "../../platform/config.js";
import { createDatabasePool } from "../../platform/database.js";
import { NEWS_HEALTH_QUERY, NEWS_ITEM_QUERY, SENTIMENT_DISTRIBUTION_QUERY } from "./application/tokens.js";
import { PostgresNewsQueryRepository } from "./infrastructure/postgres-news-query-repository.js";

const NEWS_DATABASE_POOL = Symbol("NEWS_DATABASE_POOL");

class NewsDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(NEWS_DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: NEWS_DATABASE_POOL,
      useFactory: (): Pool => createDatabasePool(loadConfig().postgres)
    },
    {
      provide: PostgresNewsQueryRepository,
      inject: [NEWS_DATABASE_POOL],
      useFactory: (pool: Pool): PostgresNewsQueryRepository =>
        new PostgresNewsQueryRepository(pool, loadConfig().news.coinDeskRss.pollIntervalMs)
    },
    { provide: NEWS_ITEM_QUERY, useExisting: PostgresNewsQueryRepository },
    { provide: SENTIMENT_DISTRIBUTION_QUERY, useExisting: PostgresNewsQueryRepository },
    { provide: NEWS_HEALTH_QUERY, useExisting: PostgresNewsQueryRepository },
    NewsDatabaseLifecycle
  ],
  exports: [NEWS_ITEM_QUERY, SENTIMENT_DISTRIBUTION_QUERY, NEWS_HEALTH_QUERY]
})
export class NewsModule {}
