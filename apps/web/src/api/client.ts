// The single module through which the SPA talks to the backend.
//
// Every backend call anywhere in this app must go through a function
// exported from this file. Components and pages must never call
// `fetch` directly, and this module must never call a third-party
// market/news API (Binance, a news source, etc.) — only the project
// backend, reached through the dev proxy / same-origin "/api" prefix
// configured in vite.config.ts.
import { isHealthResponse, type HealthResponse } from "@crypto-strategy-lab/api-contracts";

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
