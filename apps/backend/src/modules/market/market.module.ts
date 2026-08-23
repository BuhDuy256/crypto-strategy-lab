// MarketModule backs ARC-MARKET (Market Data).
//
// Owns provider ports/adapters, normalized candles, historical/live
// ingestion, validation, deduplication, gap detection/recovery,
// dataset identity/manifests, candle persistence, and provider health
// (see architecture-baseline.md). It binds the public query/dataset ports and
// Market-owned backfill use case to PostgreSQL and the Binance adapter.
import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { loadConfig } from "../../platform/config.js";
import { createDatabasePool } from "../../platform/database.js";
import {
  DATASET_SERVICE,
  MARKET_DATA_PROVIDER,
  MARKET_DATA_QUERY
} from "./application/tokens.js";
import { MarketDatasetService } from "./application/market-dataset-service.js";
import { MarketBackfillService } from "./application/market-backfill-service.js";
import type { MarketDataProvider } from "./application/market-data-provider.js";
import { BinanceMarketDataProvider } from "./infrastructure/binance-market-data-provider.js";
import { PostgresCandleRepository } from "./infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "./infrastructure/postgres-dataset-manifest-store.js";

const MARKET_DATABASE_POOL = Symbol("MARKET_DATABASE_POOL");

class MarketDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(MARKET_DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: MARKET_DATABASE_POOL,
      useFactory: (): Pool => createDatabasePool(loadConfig().postgres)
    },
    {
      provide: PostgresCandleRepository,
      inject: [MARKET_DATABASE_POOL],
      useFactory: (pool: Pool): PostgresCandleRepository => new PostgresCandleRepository(pool)
    },
    {
      provide: MARKET_DATA_QUERY,
      useExisting: PostgresCandleRepository
    },
    {
      provide: MARKET_DATA_PROVIDER,
      useFactory: (): MarketDataProvider => new BinanceMarketDataProvider()
    },
    {
      provide: MarketBackfillService,
      inject: [MARKET_DATA_PROVIDER, PostgresCandleRepository],
      useFactory: (
        provider: MarketDataProvider,
        writer: PostgresCandleRepository
      ): MarketBackfillService => new MarketBackfillService(provider, writer)
    },
    {
      provide: PostgresDatasetManifestStore,
      inject: [MARKET_DATABASE_POOL],
      useFactory: (pool: Pool): PostgresDatasetManifestStore =>
        new PostgresDatasetManifestStore(pool)
    },
    {
      provide: DATASET_SERVICE,
      inject: [PostgresCandleRepository, PostgresDatasetManifestStore],
      useFactory: (
        candles: PostgresCandleRepository,
        manifests: PostgresDatasetManifestStore
      ): MarketDatasetService => new MarketDatasetService(candles, manifests)
    },
    MarketDatabaseLifecycle
  ],
  exports: [MARKET_DATA_QUERY, DATASET_SERVICE, MarketBackfillService]
})
export class MarketModule {}
