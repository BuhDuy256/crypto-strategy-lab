// Root application module. Composes the five frozen logical modules
// (ARC-API, ARC-MARKET, ARC-STRATEGY, ARC-EXPERIMENT, ARC-NEWS) into one
// application graph. No module in this slice imports another module;
// that stays true until a later slice needs a specific cross-module
// port per the allowed dependency directions in the baseline.
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ApiModule } from "./modules/api/index.js";
import { MarketModule } from "./modules/market/index.js";
import { StrategyModule } from "./modules/strategy/index.js";
import { ExperimentModule } from "./modules/experiment/index.js";
import { NewsModule } from "./modules/news/index.js";
import { RequestIdMiddleware } from "./platform/request-id.middleware.js";

@Module({
  imports: [ApiModule, MarketModule, StrategyModule, ExperimentModule, NewsModule]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
