import { useEffect, useState } from "react";
import type { ProviderHealthResponse } from "@crypto-strategy-lab/api-contracts";
import { getProviderHealth } from "../api/client.js";

/**
 * How often the shell asks Market Data how the exchange connection is doing.
 *
 * Short enough that an outage becomes visible while it is still happening, long
 * enough that an idle dashboard is not making a request a second. Health only
 * changes on connect, disconnect and recovery, so there is nothing to gain from
 * polling faster.
 */
const POLL_INTERVAL_MS = 5000;

type IndicatorState =
  | { readonly kind: "checking" }
  | { readonly kind: "known"; readonly health: ProviderHealthResponse }
  | { readonly kind: "unreachable" };

function label(state: IndicatorState): string {
  if (state.kind === "checking") return "Market data: checking...";
  if (state.kind === "unreachable") return "Market data: status unavailable";
  const { status, reason } = state.health;
  if (status === "healthy") return "Market data: live";
  const detail = reason === undefined ? "" : ` - ${reason}`;
  if (status === "degraded") return `Market data: degraded${detail}`;
  return `Market data: unavailable${detail}`;
}

/**
 * Shows Market Data's provider health in the application shell.
 *
 * This component displays and nothing else. It does not compute which candles
 * are missing, does not call the exchange, and does not repair anything: gap
 * detection and repair belong to Market Data, and the frontend carrying any of
 * that logic is exactly what the architecture forbids.
 *
 * It also never clears chart data. An outage means new candles stop arriving,
 * not that the candles already on screen became wrong, so the charts are left
 * untouched and only this indicator changes.
 */
export function ProviderHealthIndicator() {
  const [state, setState] = useState<IndicatorState>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    const poll = (): void => {
      getProviderHealth()
        .then((health) => {
          if (!cancelled) setState({ kind: "known", health });
        })
        .catch(() => {
          // The API itself is unreachable. That is a different failure from the
          // provider being degraded, so it gets its own state rather than being
          // reported as a provider outage.
          if (!cancelled) setState({ kind: "unreachable" });
        });
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const status = state.kind === "known" ? state.health.status : state.kind;

  return (
    <div className="provider-health" data-provider-health={status} role="status">
      <span className="health-dot" aria-hidden="true" />
      {label(state)}
    </div>
  );
}
