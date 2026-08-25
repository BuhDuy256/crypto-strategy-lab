import {
  isStrategyCatalogResponse,
  type StrategyCatalogResponse,
  type CreateCompositeRequest,
  type CreateCompositeResponse,
  type ApiCompositeStrategyDefinition,
  type EvaluatePolicyRequest,
  type EvaluatePolicyResponse
} from "@crypto-strategy-lab/api-contracts";
// The single module through which the SPA talks to the backend.
//
// Every backend call anywhere in this app must go through a function
// exported from this file. Components and pages must never call
// `fetch` directly, and this module must never call a third-party
// market/news API (Binance, a news source, etc.) — only the project
// backend, reached through the dev proxy / same-origin "/api" prefix
// configured in vite.config.ts.
import {
  isCandleHistoryResponse,
  isBacktestRunResponse,
  isBacktestResultResponse,
  isBacktestTradesResponse,
  isHealthResponse,
  type CandleHistoryRequest,
  type CandleHistoryResponse,
  type HealthResponse,
  type BacktestRunResponse,
  type BacktestResultResponse,
  type BacktestTradesResponse,
  type StartBacktestRequest,
  type CreateSpecificationRequest,
  type CreateSpecificationResponse,
  isCreateSpecificationResponse,
  isLeaderboardResponse,
  isSearchProgressResponse,
  isProvenanceResponse,
  isBacktestAnnotationsResponse,
  type LeaderboardResponse,
  type LeaderboardSort,
  type SearchProgressResponse,
  type ProvenanceResponse,
  type BacktestAnnotationsResponse
} from "@crypto-strategy-lab/api-contracts";

// In dev, Vite proxies "/api/*" to the backend (see vite.config.ts).
// In a production build, this expects a reverse proxy or same-origin
// deployment to expose the backend under the same "/api" prefix;
// wiring that deployment topology is out of scope for this slice.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** Thrown when the backend responds but the body does not match the expected contract. */
export class ApiContractError extends Error {
  constructor(endpoint: string) {
    super(`Response from ${endpoint} did not match the expected contract.`);
    this.name = "ApiContractError";
  }
}

async function getJson<T>(path: string, isValid: (value: unknown) => value is T): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isValid(body)) {
    throw new ApiContractError(path);
  }
  return body;
}

/** Calls the backend's GET /health endpoint. */
export function getHealth(): Promise<HealthResponse> {
  return getJson("/health", isHealthResponse);
}

async function postJson<T>(path: string, input: unknown, isValid: (value: unknown) => value is T): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(`Request to ${path} failed with status ${response.status}`);
  const body: unknown = await response.json();
  if (!isValid(body)) throw new ApiContractError(path);
  return body;
}

/** Reads normalized durable candles from the project backend. */
export function getCandleHistory(request: CandleHistoryRequest): Promise<CandleHistoryResponse> {
  const query = new URLSearchParams({
    provider: request.provider,
    symbol: request.symbol,
    timeframe: request.timeframe,
    startTime: String(request.startTime),
    endTime: String(request.endTime)
  });
  return getJson(`/market/candles?${query.toString()}`, isCandleHistoryResponse);
}

export function startBacktest(request: StartBacktestRequest): Promise<BacktestRunResponse> {
  return postJson("/backtests", request, isBacktestRunResponse);
}

export function getBacktestRun(runId: string): Promise<BacktestRunResponse> {
  return getJson(`/backtests/${encodeURIComponent(runId)}`, isBacktestRunResponse);
}

export function getBacktestResult(runId: string): Promise<BacktestResultResponse> {
  return getJson(`/backtests/${encodeURIComponent(runId)}/result`, isBacktestResultResponse);
}

export function getBacktestTrades(
  runId: string,
  pageNumber = 1,
  pageSize = 10
): Promise<BacktestTradesResponse> {
  const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(pageSize) });
  return getJson(
    `/backtests/${encodeURIComponent(runId)}/trades?${query.toString()}`,
    isBacktestTradesResponse
  );
}

export function createSpecification(request: CreateSpecificationRequest): Promise<CreateSpecificationResponse> {
  return postJson("/specifications", request, isCreateSpecificationResponse);
}

export function getStrategies(): Promise<StrategyCatalogResponse> {
  return getJson("/strategies", isStrategyCatalogResponse);
}

/** Reads the derived Top-K leaderboard of a search experiment. */
export function getLeaderboard(specId: string, sort: LeaderboardSort = "rank"): Promise<LeaderboardResponse> {
  const query = new URLSearchParams({ sort });
  return getJson(`/experiments/${encodeURIComponent(specId)}/leaderboard?${query.toString()}`, isLeaderboardResponse);
}

/** Reads the complete progress snapshot of a search experiment. */
export function getSearchProgress(specId: string): Promise<SearchProgressResponse> {
  return getJson(`/experiments/${encodeURIComponent(specId)}/search/progress`, isSearchProgressResponse);
}

/** Reads the full reproducibility checklist for one backtest result. */
export function getBacktestProvenance(runId: string): Promise<ProvenanceResponse> {
  return getJson(`/backtests/${encodeURIComponent(runId)}/provenance`, isProvenanceResponse);
}

/** Reads a result's visualization annotations, recomputed on demand. */
export function getBacktestAnnotations(runId: string): Promise<BacktestAnnotationsResponse> {
  return getJson(`/backtests/${encodeURIComponent(runId)}/annotations`, isBacktestAnnotationsResponse);
}

export async function createComposite(req: CreateCompositeRequest): Promise<CreateCompositeResponse> {
  const response = await fetch(`${API_BASE_URL}/strategies/composites`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req)
  });
  if (!response.ok) throw new Error(`Failed to create composite: ${response.status}`);
  return response.json();
}

export async function listComposites(): Promise<ApiCompositeStrategyDefinition[]> {
  const response = await fetch(`${API_BASE_URL}/strategies/composites`);
  if (!response.ok) throw new Error(`Failed to list composites: ${response.status}`);
  return response.json();
}

export async function getComposite(id: string): Promise<ApiCompositeStrategyDefinition> {
  const response = await fetch(`${API_BASE_URL}/strategies/composites/${id}`);
  if (!response.ok) throw new Error(`Failed to fetch composite: ${response.status}`);
  return response.json();
}

export async function evaluatePolicy(req: EvaluatePolicyRequest): Promise<EvaluatePolicyResponse> {
  const response = await fetch(`${API_BASE_URL}/strategies/composites/evaluate-policy`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req)
  });
  if (!response.ok) throw new Error(`Failed to evaluate policy: ${response.status}`);
  return response.json();
}
