// ApiModule backs ARC-API (API / Presentation).
//
// Owns HTTP/WebSocket transport, DTO validation, client subscription/
// session state, push filtering/backpressure, and query composition.
// It contains no strategy, backtest, evaluation, ranking, or
// provider-specific business logic (see architecture-baseline.md).
import {
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown
} from "@nestjs/common";
import { MarketModule } from "../market/index.js";
import { StrategyModule } from "../strategy/index.js";
import { ExperimentModule, SearchCoordinator, SearchExperimentHost } from "../experiment/index.js";
import { StructuredLogger } from "../../platform/logger.js";
import { BacktestController } from "./backtest.controller.js";
import { CandleHistoryController } from "./candle-history.controller.js";
import { HealthController } from "./health.controller.js";
import { StrategyController } from "./strategy.controller.js";
import { GeneratorController } from "./generator.controller.js";
import { SpecificationController } from "./specification.controller.js";
import { SearchController } from "./search.controller.js";
import { SearchExperimentController } from "./search-experiment.controller.js";
import { LeaderboardController } from "./leaderboard.controller.js";
import { MarketRealtimeGateway } from "./market-realtime.gateway.js";
import { RealtimeStatusController } from "./realtime-status.controller.js";
import { RedisLiveNotificationSubscriber } from "../../platform/realtime/redis-live-notifications.js";
import { loadConfig } from "../../platform/config.js";

// Drives the search host across the API process lifecycle: resume running
// experiments on start (a coordinator restart recovers from durable state), and
// stop driving loops on shutdown without touching durable state.
class SearchExperimentLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(SearchExperimentHost) private readonly host: SearchExperimentHost) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.host.resumeAll();
  }

  onApplicationShutdown(): void {
    this.host.stopAll();
  }
}

class RealtimeLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(RedisLiveNotificationSubscriber)
    private readonly subscriber: RedisLiveNotificationSubscriber
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.subscriber.close();
  }
}

@Module({
  imports: [MarketModule, ExperimentModule, StrategyModule],
  controllers: [
    HealthController,
    CandleHistoryController,
    BacktestController,
    SpecificationController,
    StrategyController,
    GeneratorController,
    SearchController,
    SearchExperimentController,
    LeaderboardController,
    RealtimeStatusController
  ],
  providers: [
    {
      provide: RedisLiveNotificationSubscriber,
      useFactory: () => new RedisLiveNotificationSubscriber(
        loadConfig().redis.url, new StructuredLogger("api")
      )
    },
    {
      provide: "WS_OUTBOUND_BUFFER_MAX",
      useFactory: () => loadConfig().websocket.maxOutboundMessages
    },
    {
      provide: "WS_SUBSCRIPTION_MAX",
      useFactory: () => loadConfig().websocket.maxSubscriptionsPerClient
    },
    MarketRealtimeGateway,
    RealtimeLifecycle,
    {
      provide: SearchExperimentHost,
      inject: [SearchCoordinator],
      useFactory: (coordinator: SearchCoordinator) =>
        new SearchExperimentHost(coordinator, new StructuredLogger("search"))
    },
    SearchExperimentLifecycle
  ]
})
export class ApiModule {}
