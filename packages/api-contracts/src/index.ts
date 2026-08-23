// Shared, framework-independent response contracts between the
// backend HTTP API and the web SPA.
//
// This package must stay free of NestJS, React, and any other
// framework dependency. It exists so the frontend never has to guess
// the shape of a backend response or duplicate it by hand.

/**
 * Response body for `GET /health`.
 * Must stay in sync with `apps/backend/src/modules/api/health.controller.ts`.
 */
export interface HealthResponse {
  readonly status: "ok";
}

/** Runtime type guard for {@link HealthResponse}, for validating an unknown fetch response body. */
export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status: unknown }).status === "ok"
  );
}

export const API_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"] as const;
export type ApiTimeframe = (typeof API_TIMEFRAMES)[number];

export interface CandleHistoryRequest {
  readonly provider: "binance";
  readonly symbol: "BTCUSDT";
  readonly timeframe: ApiTimeframe;
  readonly startTime: number;
  readonly endTime: number;
}

export interface ApiCandle {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: ApiTimeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closed: boolean;
  readonly revision: number;
}

export interface CandleHistoryResponse {
  readonly candles: readonly ApiCandle[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isApiCandle(value: unknown): value is ApiCandle {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candle = value as Readonly<Record<string, unknown>>;
  return (
    typeof candle.provider === "string" &&
    typeof candle.symbol === "string" &&
    typeof candle.timeframe === "string" &&
    (API_TIMEFRAMES as readonly string[]).includes(candle.timeframe) &&
    isFiniteNumber(candle.openTime) &&
    isFiniteNumber(candle.closeTime) &&
    isFiniteNumber(candle.open) &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    isFiniteNumber(candle.close) &&
    isFiniteNumber(candle.volume) &&
    candle.closed === true &&
    Number.isSafeInteger(candle.revision)
  );
}

export function isCandleHistoryResponse(value: unknown): value is CandleHistoryResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "candles" in value &&
    Array.isArray(value.candles) &&
    value.candles.every((candle) => isApiCandle(candle))
  );
}

export interface StartBacktestRequest {
  readonly specId: string;
}

export interface BacktestRunResponse {
  readonly runId: string;
  readonly specId: string;
  readonly candidateId: string;
  readonly idempotencyKey: string;
  readonly status: "queued" | "running" | "completed" | "failed";
  readonly failureReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function isBacktestRunResponse(value: unknown): value is BacktestRunResponse {
  if (typeof value !== "object" || value === null) return false;
  const run = value as Readonly<Record<string, unknown>>;
  return typeof run.runId === "string" && typeof run.specId === "string" &&
    typeof run.candidateId === "string" && typeof run.idempotencyKey === "string" &&
    ["queued", "running", "completed", "failed"].includes(String(run.status)) &&
    typeof run.createdAt === "string" && typeof run.updatedAt === "string" &&
    (run.failureReason === undefined || typeof run.failureReason === "string");
}

export interface PendingBacktestResultResponse {
  readonly runId: string;
  readonly status: "queued" | "running";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FailedBacktestResultResponse {
  readonly runId: string;
  readonly status: "failed";
  readonly failureReason: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BacktestMetricSet {
  readonly id: string;
  readonly version: string;
}

export interface BacktestMetrics {
  readonly totalReturn: number;
  readonly winRate: number;
  readonly maximumDrawdown: number;
  readonly numberOfTrades: number;
}

export interface BacktestExecutionAssumptions {
  readonly initialCapital: number;
  readonly feeRate: number;
  readonly slippageRate: number;
  readonly signalTiming: "close-of-bar";
  readonly fillRule: "next-open";
  readonly maxConcurrentPositions: 1;
  readonly leverage: 1;
  readonly positionSizing: "available-equity";
  readonly allowedDirections: readonly ("long" | "short")[];
  readonly stopLoss: { readonly enabled: boolean; readonly percentage?: number };
  readonly takeProfit: { readonly enabled: boolean; readonly percentage?: number };
  readonly sameBarExitPriority: "stop-loss-first";
  readonly finalPositionPolicy: "liquidate-at-final-close";
  readonly decimalPlaces: 8;
}

export interface CompletedBacktestResultResponse {
  readonly runId: string;
  readonly status: "completed";
  readonly resultId: string;
  readonly specId: string;
  readonly specificationHash: string;
  readonly metricSet: BacktestMetricSet;
  readonly metrics: BacktestMetrics;
  readonly executionAssumptions: BacktestExecutionAssumptions;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string;
}

export type BacktestResultResponse =
  | PendingBacktestResultResponse
  | FailedBacktestResultResponse
  | CompletedBacktestResultResponse;

export interface ApiBacktestTrade {
  readonly sequenceNumber: number;
  readonly direction: "long" | "short";
  readonly entryTime: number;
  readonly entryPrice: number;
  readonly exitTime: number;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly entryFee: number;
  readonly exitFee: number;
  readonly slippage: number;
  readonly profitAndLoss: number;
  readonly exitReason: "signal" | "stop-loss" | "take-profit" | "final-liquidation";
}

export interface BacktestTradePageResponse {
  readonly runId: string;
  readonly status: "completed";
  readonly trades: readonly ApiBacktestTrade[];
  readonly page: { readonly pageNumber: number; readonly pageSize: number; readonly totalCount: number };
}

export type BacktestTradesResponse =
  | PendingBacktestResultResponse
  | FailedBacktestResultResponse
  | BacktestTradePageResponse;

function isResultBase(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Readonly<Record<string, unknown>>;
  return typeof result.runId === "string" && typeof result.status === "string" &&
    typeof result.createdAt === "string" && typeof result.updatedAt === "string";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isMetricSet(value: unknown): value is BacktestMetricSet {
  return isRecord(value) && typeof value.id === "string" && typeof value.version === "string";
}

function isMetrics(value: unknown): value is BacktestMetrics {
  return isRecord(value) && isFiniteNumber(value.totalReturn) && isFiniteNumber(value.winRate) &&
    isFiniteNumber(value.maximumDrawdown) && isFiniteNumber(value.numberOfTrades);
}

function isExitRule(value: unknown): boolean {
  if (!isRecord(value) || typeof value.enabled !== "boolean") return false;
  if (value.percentage !== undefined && !isFiniteNumber(value.percentage)) return false;
  return !value.enabled || isFiniteNumber(value.percentage);
}

function isExecutionAssumptions(value: unknown): value is BacktestExecutionAssumptions {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.initialCapital) && isFiniteNumber(value.feeRate) &&
    isFiniteNumber(value.slippageRate) && value.signalTiming === "close-of-bar" &&
    value.fillRule === "next-open" && value.maxConcurrentPositions === 1 &&
    value.leverage === 1 && value.positionSizing === "available-equity" &&
    Array.isArray(value.allowedDirections) && value.allowedDirections.length === 2 &&
    value.allowedDirections.includes("long") && value.allowedDirections.includes("short") &&
    isExitRule(value.stopLoss) && isExitRule(value.takeProfit) &&
    value.sameBarExitPriority === "stop-loss-first" &&
    value.finalPositionPolicy === "liquidate-at-final-close" && value.decimalPlaces === 8;
}

function isTrade(value: unknown): value is ApiBacktestTrade {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.sequenceNumber) && Number(value.sequenceNumber) >= 0 &&
    (value.direction === "long" || value.direction === "short") &&
    isFiniteNumber(value.entryTime) && isFiniteNumber(value.entryPrice) &&
    isFiniteNumber(value.exitTime) && isFiniteNumber(value.exitPrice) &&
    isFiniteNumber(value.quantity) && isFiniteNumber(value.entryFee) &&
    isFiniteNumber(value.exitFee) && isFiniteNumber(value.slippage) &&
    isFiniteNumber(value.profitAndLoss) &&
    ["signal", "stop-loss", "take-profit", "final-liquidation"].includes(String(value.exitReason));
}

function isPage(value: unknown): value is BacktestTradePageResponse["page"] {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.pageNumber) && Number(value.pageNumber) >= 1 &&
    Number.isSafeInteger(value.pageSize) && Number(value.pageSize) >= 1 && Number(value.pageSize) <= 100 &&
    Number.isSafeInteger(value.totalCount) && Number(value.totalCount) >= 0;
}

export function isBacktestResultResponse(value: unknown): value is BacktestResultResponse {
  if (!isResultBase(value)) return false;
  if (value.status === "queued" || value.status === "running") return true;
  if (value.status === "failed") return typeof value.failureReason === "string";
  return value.status === "completed" && typeof value.resultId === "string" &&
    typeof value.specId === "string" && typeof value.specificationHash === "string" &&
    typeof value.completedAt === "string" && isMetricSet(value.metricSet) &&
    isMetrics(value.metrics) && isExecutionAssumptions(value.executionAssumptions);
}

export function isBacktestTradesResponse(value: unknown): value is BacktestTradesResponse {
  if (isResultBase(value) && (value.status === "queued" || value.status === "running")) return true;
  if (isResultBase(value) && value.status === "failed") return typeof value.failureReason === "string";
  if (typeof value !== "object" || value === null) return false;
  const page = value as Readonly<Record<string, unknown>>;
  return page.status === "completed" && typeof page.runId === "string" &&
    Array.isArray(page.trades) && page.trades.every(isTrade) && isPage(page.page);
}
