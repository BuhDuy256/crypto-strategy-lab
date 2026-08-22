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
