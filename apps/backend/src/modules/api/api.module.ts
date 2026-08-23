// ApiModule backs ARC-API (API / Presentation).
//
// Owns HTTP/WebSocket transport, DTO validation, client subscription/
// session state, push filtering/backpressure, and query composition.
// It contains no strategy, backtest, evaluation, ranking, or
// provider-specific business logic (see architecture-baseline.md).
import { Module } from "@nestjs/common";
import { MarketModule } from "../market/index.js";
import { ExperimentModule } from "../experiment/index.js";
import { BacktestController } from "./backtest.controller.js";
import { CandleHistoryController } from "./candle-history.controller.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [MarketModule, ExperimentModule],
  controllers: [HealthController, CandleHistoryController, BacktestController]
})
export class ApiModule {}
