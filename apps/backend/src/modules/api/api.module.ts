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

@Module({
  imports: [MarketModule, ExperimentModule, StrategyModule],
  controllers: [
    HealthController,
    CandleHistoryController,
    BacktestController,
    SpecificationController,
    StrategyController,
    GeneratorController,
    SearchController
  ],
  providers: [
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
