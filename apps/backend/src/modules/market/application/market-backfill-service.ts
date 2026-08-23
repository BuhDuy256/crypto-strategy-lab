// Market-owned use case that fetches normalized history and commits it append-only.

import type { Candle } from "../domain/candle.js";
import type {
  HistoricalCandlesRequest,
  MarketDataProvider
} from "./market-data-provider.js";

export interface CandleBatchWriter {
  appendMany(candles: readonly Candle[]): Promise<readonly Candle[]>;
}

export class MarketBackfillService {
  constructor(
    private readonly provider: MarketDataProvider,
    private readonly writer: CandleBatchWriter
  ) {}

  async backfill(request: HistoricalCandlesRequest): Promise<number> {
    const candles = await this.provider.fetchHistorical(request);
    await this.writer.appendMany(candles);
    return candles.length;
  }
}
