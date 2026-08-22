// ApiModule backs ARC-API (API / Presentation).
//
// Owns HTTP/WebSocket transport, DTO validation, client subscription/
// session state, push filtering/backpressure, and query composition.
// It contains no strategy, backtest, evaluation, ranking, or
// provider-specific business logic (see architecture-baseline.md).
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";

@Module({
  controllers: [HealthController]
})
export class ApiModule {}
