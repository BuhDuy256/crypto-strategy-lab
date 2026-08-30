// Public Experiment read port for one result and its server-paged trades.

import type {
  BacktestResultResponse,
  CompletedBacktestResultResponse,
  BacktestTradePageResponse
} from "@crypto-strategy-lab/api-contracts";

export interface TradePageRequest {
  readonly pageNumber: number;
  readonly pageSize: number;
}

export abstract class BacktestResultQuery {
  abstract getResult(runId: string): Promise<BacktestResultResponse | undefined>;
  abstract getTrades(
    result: CompletedBacktestResultResponse,
    page: TradePageRequest
  ): Promise<BacktestTradePageResponse>;
}
