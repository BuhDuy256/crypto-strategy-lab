// Public surface of the market module. Nothing else in this module is
// importable from outside it.
export { MarketModule } from "./market.module.js";
export {
  DATASET_SERVICE,
  MARKET_DATA_PROVIDER,
  MARKET_DATA_QUERY,
  MARKET_SNAPSHOT_QUERY
} from "./application/tokens.js";
export { MarketBackfillService } from "./application/market-backfill-service.js";
export {
  SUPPORTED_TIMEFRAMES,
  timeframeDurationMs,
  type Candle,
  type Timeframe
} from "./domain/candle.js";
export type { DatasetRef, DatasetTimeRange } from "./domain/dataset-ref.js";
export type {
  CreateDatasetRequest,
  DatasetGap,
  DatasetManifest,
  ResolvedDataset
} from "./domain/dataset-manifest.js";
export type { DatasetService } from "./application/dataset-service.js";
export type {
  MarketDataQuery,
  MarketDataRangeRequest
} from "./application/market-data-query.js";
export type {
  MarketSnapshot,
  MarketSnapshotQuery,
  MarketSnapshotRequest
} from "./application/market-snapshot-query.js";
