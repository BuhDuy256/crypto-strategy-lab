import { useEffect, useState } from "react";
import { getHealth } from "../api/client.js";

type HealthState = { kind: "checking" } | { kind: "ok" } | { kind: "unreachable" };

/** Small status indicator showing live backend health, obtained through the typed API client. */
export function HealthStatus() {
  const [state, setState] = useState<HealthState>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(() => {
        if (!cancelled) {
          setState({ kind: "ok" });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ kind: "unreachable" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    state.kind === "checking" ? "Backend: checking..." : state.kind === "ok" ? "Backend: ok" : "Backend: unreachable";

  return (
    <div className="health-status" data-health={state.kind} role="status">
      <span className="health-dot" aria-hidden="true" />
      {label}
    </div>
  );
}
