// Narrow composition root for the separate market ingest process only.
//
// Ingest is its own process role in the frozen deployment topology, so it gets
// its own composition root rather than joining the API's. Nothing here is HTTP
// or WebSocket-gateway shaped: the process holds a provider connection, writes
// candles, and publishes best-effort notifications.

import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { loadConfig } from "../../platform/config.js";
import { createDatabasePool } from "../../platform/database.js";
import { StructuredLogger } from "../../platform/logger.js";
import { CommittedLivePublisher } from "../../platform/realtime/committed-live-publisher.js";
import { RedisLiveNotificationPublisher } from "../../platform/realtime/redis-live-notifications.js";
import { LiveIngestSupervisor } from "./application/live-ingest-supervisor.js";
import { MarketIngestRuntime } from "./application/market-ingest-runtime.js";
import { MarketGapRecoveryService } from "./application/market-gap-recovery-service.js";
import { MarketLiveIngestService } from "./application/market-live-ingest-service.js";
import { ProviderHealthTracker } from "./application/provider-health.js";
import { SUPPORTED_TIMEFRAMES, type Timeframe } from "./domain/candle.js";
import { BinanceMarketDataProvider } from "./infrastructure/binance-market-data-provider.js";
import { PostgresCandleRepository } from "./infrastructure/postgres-candle-repository.js";
import { PostgresProviderHealthRepository } from "./infrastructure/postgres-provider-health-repository.js";
import type { LiveCandlesRequest } from "./application/market-data-provider.js";

export const MARKET_INGEST_POOL = Symbol("MARKET_INGEST_POOL");
export const MARKET_INGEST_STREAMS = Symbol("MARKET_INGEST_STREAMS");
export const MARKET_INGEST_LOGGER = Symbol("MARKET_INGEST_LOGGER");

const PROCESS_ROLE = "market-ingest";

/** The one provider this version connects to. Matches `BinanceMarketDataProvider`. */
const PROVIDER_ID = "binance";

/** Reads the configured stream set and rejects a timeframe the domain does not know. */
export function readIngestStreams(
  symbol: string,
  timeframes: readonly string[]
): readonly LiveCandlesRequest[] {
  return timeframes.map((timeframe) => {
    if (!(SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframe)) {
      throw new Error(
        `MARKET_INGEST_TIMEFRAMES: "${timeframe}" is not one of ${SUPPORTED_TIMEFRAMES.join(", ")}`
      );
    }
    return { symbol, timeframe: timeframe as Timeframe };
  });
}

class MarketIngestLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(MARKET_INGEST_POOL) private readonly pool: Pool,
    @Inject(BinanceMarketDataProvider) private readonly provider: BinanceMarketDataProvider,
    @Inject(RedisLiveNotificationPublisher) private readonly notifications: RedisLiveNotificationPublisher
  ) {}

  async onApplicationShutdown(): Promise<void> {
    this.provider.closeLiveStreams();
    await this.notifications.close();
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: MARKET_INGEST_LOGGER,
      useFactory: (): StructuredLogger => new StructuredLogger(PROCESS_ROLE)
    },
    {
      provide: MARKET_INGEST_POOL,
      useFactory: (): Pool => createDatabasePool(loadConfig().postgres)
    },
    {
      provide: MARKET_INGEST_STREAMS,
      useFactory: (): readonly LiveCandlesRequest[] => {
        const ingest = loadConfig().marketIngest;
        return readIngestStreams(ingest.symbol, ingest.timeframes);
      }
    },
    {
      provide: PostgresCandleRepository,
      inject: [MARKET_INGEST_POOL],
      useFactory: (pool: Pool): PostgresCandleRepository => new PostgresCandleRepository(pool)
    },
    {
      provide: PostgresProviderHealthRepository,
      inject: [MARKET_INGEST_POOL],
      useFactory: (pool: Pool): PostgresProviderHealthRepository =>
        new PostgresProviderHealthRepository(pool)
    },
    {
      provide: ProviderHealthTracker,
      inject: [PostgresProviderHealthRepository, MARKET_INGEST_LOGGER],
      useFactory: (
        health: PostgresProviderHealthRepository,
        logger: StructuredLogger
      ): ProviderHealthTracker => new ProviderHealthTracker(PROVIDER_ID, health, logger)
    },
    {
      provide: BinanceMarketDataProvider,
      inject: [MARKET_INGEST_LOGGER],
      useFactory: (logger: StructuredLogger): BinanceMarketDataProvider =>
        new BinanceMarketDataProvider({
          streamBaseUrl: loadConfig().marketIngest.streamBaseUrl,
          streamLogger: logger
        })
    },
    {
      provide: RedisLiveNotificationPublisher,
      inject: [MARKET_INGEST_LOGGER],
      useFactory: (logger: StructuredLogger): RedisLiveNotificationPublisher =>
        new RedisLiveNotificationPublisher(loadConfig().redis.url, logger)
    },
    {
      provide: CommittedLivePublisher,
      inject: [RedisLiveNotificationPublisher, MARKET_INGEST_LOGGER],
      useFactory: (
        transport: RedisLiveNotificationPublisher,
        logger: StructuredLogger
      ): CommittedLivePublisher => new CommittedLivePublisher(transport, logger)
    },
    {
      provide: MarketLiveIngestService,
      inject: [
        BinanceMarketDataProvider,
        PostgresCandleRepository,
        CommittedLivePublisher,
        MARKET_INGEST_LOGGER,
        ProviderHealthTracker
      ],
      useFactory: (
        provider: BinanceMarketDataProvider,
        candles: PostgresCandleRepository,
        publisher: CommittedLivePublisher,
        logger: StructuredLogger,
        health: ProviderHealthTracker
      ): MarketLiveIngestService =>
        new MarketLiveIngestService(provider, candles, publisher, logger, { observer: health })
    },
    {
      provide: MarketGapRecoveryService,
      inject: [BinanceMarketDataProvider, PostgresCandleRepository, MARKET_INGEST_LOGGER],
      useFactory: (
        provider: BinanceMarketDataProvider,
        candles: PostgresCandleRepository,
        logger: StructuredLogger
      ): MarketGapRecoveryService =>
        // The boundary reader and the writer are the same repository on purpose:
        // recovery must append through the path live ingest and backfill already
        // use, so a recovered candle is indistinguishable from any other.
        new MarketGapRecoveryService(provider, candles, candles, logger)
    },
    {
      provide: LiveIngestSupervisor,
      inject: [
        MarketLiveIngestService,
        ProviderHealthTracker,
        MARKET_INGEST_STREAMS,
        MARKET_INGEST_LOGGER,
        MarketGapRecoveryService
      ],
      useFactory: (
        ingest: MarketLiveIngestService,
        health: ProviderHealthTracker,
        streams: readonly LiveCandlesRequest[],
        logger: StructuredLogger,
        recovery: MarketGapRecoveryService
      ): LiveIngestSupervisor =>
        new LiveIngestSupervisor(ingest, health, streams, logger, {
          // The provider id is bound here, where the adapter is chosen, so the
          // supervisor never has to know which provider it is supervising.
          recover: async (stream) => recovery.recover({ provider: PROVIDER_ID, ...stream })
        })
    },
    {
      provide: MarketIngestRuntime,
      inject: [LiveIngestSupervisor, MarketLiveIngestService, MARKET_INGEST_LOGGER],
      useFactory: (
        supervisor: LiveIngestSupervisor,
        ingest: MarketLiveIngestService,
        logger: StructuredLogger
      ): MarketIngestRuntime => new MarketIngestRuntime(supervisor, ingest, logger)
    },
    MarketIngestLifecycle
  ],
  exports: [MarketIngestRuntime]
})
export class MarketIngestModule {}
