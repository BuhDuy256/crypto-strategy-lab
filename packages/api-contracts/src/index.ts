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
  readonly annotations: readonly ApiAnnotation[];
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
    isMetrics(value.metrics) && isExecutionAssumptions(value.executionAssumptions) &&
    Array.isArray(value.annotations) && value.annotations.every(isApiAnnotation);
}

export function isBacktestTradesResponse(value: unknown): value is BacktestTradesResponse {
  if (isResultBase(value) && (value.status === "queued" || value.status === "running")) return true;
  if (isResultBase(value) && value.status === "failed") return typeof value.failureReason === "string";
  if (typeof value !== "object" || value === null) return false;
  const page = value as Readonly<Record<string, unknown>>;
  return page.status === "completed" && typeof page.runId === "string" &&
    Array.isArray(page.trades) && page.trades.every(isTrade) && isPage(page.page);
}

export interface ApiAnnotationPoint {
  readonly time: number;
  readonly value: number;
}

export interface ApiLineAnnotation {
  readonly type: "line";
  readonly id: string;
  readonly label: string;
  readonly points: readonly ApiAnnotationPoint[];
}

export interface ApiBandAnnotation {
  readonly type: "band";
  readonly id: string;
  readonly label: string;
  readonly upper: readonly ApiAnnotationPoint[];
  readonly lower: readonly ApiAnnotationPoint[];
}

export interface ApiZoneAnnotation {
  readonly type: "zone";
  readonly id: string;
  readonly label: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly lower: number;
  readonly upper: number;
}

export interface ApiLevelAnnotation {
  readonly type: "level";
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export interface ApiMarkerAnnotation {
  readonly type: "marker";
  readonly id: string;
  readonly label: string;
  readonly time: number;
  readonly value?: number;
  readonly direction: "up" | "down" | "neutral";
}

export type ApiAnnotation =
  | ApiLineAnnotation
  | ApiBandAnnotation
  | ApiZoneAnnotation
  | ApiLevelAnnotation
  | ApiMarkerAnnotation;

export function isApiAnnotationPoint(value: unknown): value is ApiAnnotationPoint {
  return isRecord(value) && isFiniteNumber(value.time) && isFiniteNumber(value.value);
}

export function isApiAnnotation(value: unknown): value is ApiAnnotation {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.id !== "string" || typeof value.label !== "string") return false;
  const val = value as Record<string, unknown>;
  switch (val.type) {
    case "line": return Array.isArray(val.points) && val.points.every(isApiAnnotationPoint);
    case "band": return Array.isArray(val.upper) && Array.isArray(val.lower) && val.upper.every(isApiAnnotationPoint) && val.lower.every(isApiAnnotationPoint);
    case "zone": return isFiniteNumber(val.startTime) && isFiniteNumber(val.endTime) && isFiniteNumber(val.lower) && isFiniteNumber(val.upper);
    case "level": return isFiniteNumber(val.value);
    case "marker": return isFiniteNumber(val.time) && (val.value === undefined || isFiniteNumber(val.value)) && ["up", "down", "neutral"].includes(String(val.direction));
    default: return false;
  }
}

export interface CreateSpecificationRequest {
  readonly schemaVersion: "v1";
  readonly datasetRef: { readonly datasetId: string; readonly version: number; readonly manifestVersion: "v1"; readonly provider: string; readonly symbols: readonly string[]; readonly timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d"; readonly range: { readonly startTime: number; readonly endTime: number; }; readonly revisionWatermark: number; readonly integrityHash: string; };
  readonly strategy: {
    readonly id: string;
    readonly version: string;
    readonly parameters: Record<string, unknown>;
  };
  readonly execution: {
    readonly initialCapital: number;
    readonly feeRate: number;
    readonly slippageRate: number;
    readonly signalTiming: "close-of-bar";
    readonly leverage: 1;
    readonly positionSizing: "available-equity";
    readonly allowedDirections: readonly ("long" | "short")[];
    readonly stopLoss: { readonly enabled: boolean; readonly percentage?: number };
    readonly takeProfit: { readonly enabled: boolean; readonly percentage?: number };
    readonly sameBarExitPriority: "stop-loss-first";
    readonly finalPositionPolicy: "liquidate-at-final-close";
    readonly decimalPlaces: 8;
  };
  readonly metricSet: { readonly id: string; readonly version: string };
}

export interface CreateSpecificationResponse {
  readonly specId: string;
}

export function isCreateSpecificationResponse(value: unknown): value is CreateSpecificationResponse {
  return typeof value === "object" && value !== null && "specId" in value && typeof (value as { specId: unknown }).specId === "string";
}

export type ApiStrategyCategory = "trend" | "momentum" | "volatility" | "structure" | "sentiment" | "composite";
export type ApiStrategyCapability = "long" | "short" | "annotations" | "sentiment";

export interface ApiParameterProperty {
  readonly type: "string" | "number" | "integer" | "boolean" | "enum";
  readonly label: string;
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly values?: readonly string[];
  readonly default?: unknown;
}

export interface ApiParameterSchema {
  readonly properties: Record<string, ApiParameterProperty>;
  readonly required: readonly string[];
}

export interface ApiStrategyDescriptor {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly category: ApiStrategyCategory;
  readonly capabilities: readonly ApiStrategyCapability[];
  readonly parameterSchema: ApiParameterSchema;
  readonly requiredInputs: readonly string[];
}

export interface StrategyCatalogResponse {
  readonly strategies: readonly ApiStrategyDescriptor[];
}

export function isStrategyCatalogResponse(value: unknown): value is StrategyCatalogResponse {
  if (!isRecord(value) || !Array.isArray(value.strategies)) return false;
  return true;
}

export interface ApiGeneratorDescriptor {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly configurationSchema: ApiParameterSchema;
}

export interface GeneratorCatalogResponse {
  readonly generators: readonly ApiGeneratorDescriptor[];
}

export function isGeneratorCatalogResponse(value: unknown): value is GeneratorCatalogResponse {
  if (!isRecord(value) || !Array.isArray(value.generators)) return false;
  return true;
}

export interface ApiComponentStrategyReference {
  readonly id: string;
  readonly version: string;
  readonly parameters: Record<string, unknown>;
}

export interface ApiCombinationPolicyReference {
  readonly id: string;
  readonly version: string;
  readonly configuration: Record<string, unknown>;
}

export interface ApiCompositeStrategyDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly components: readonly ApiComponentStrategyReference[];
  readonly policy: ApiCombinationPolicyReference;
}

export interface CreateCompositeRequest {
  readonly name: string;
  readonly description: string;
  readonly components: readonly ApiComponentStrategyReference[];
  readonly policy: ApiCombinationPolicyReference;
}

export interface CreateCompositeResponse {
  readonly id: string;
  readonly version: string;
}

export interface EvaluatePolicyRequest {
  readonly policy: ApiCombinationPolicyReference;
  readonly signals: readonly ("buy" | "sell" | "hold")[];
}

export interface EvaluatePolicyResponse {
  readonly action: "buy" | "sell" | "hold";
}
