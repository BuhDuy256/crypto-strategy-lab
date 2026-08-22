// MarketModule backs ARC-MARKET (Market Data).
//
// Owns provider ports/adapters, normalized candles, historical/live
// ingestion, validation, deduplication, gap detection/recovery,
// dataset identity/manifests, candle persistence, and provider health
// (see architecture-baseline.md). Empty in this slice: composition
// boundary only, no business logic yet.
import { Module } from "@nestjs/common";

@Module({})
export class MarketModule {}
