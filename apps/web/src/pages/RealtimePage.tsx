// The Realtime page. Four is a layout choice declared here and nowhere else:
// the API holds however many subscriptions the page opens, never a count of its
// own.

import type { ApiTimeframe } from "@crypto-strategy-lab/api-contracts";
import { ChartWidget } from "../components/ChartWidget.js";
import { useRealtimeConnection } from "../hooks/use-chart-subscription.js";

interface ChartSlot {
  /** Stable across every render and every timeframe change. */
  readonly id: string;
  readonly initialTimeframe: ApiTimeframe;
}

const CHART_SLOTS: readonly ChartSlot[] = [
  { id: "chart-1", initialTimeframe: "5m" },
  { id: "chart-2", initialTimeframe: "15m" },
  { id: "chart-3", initialTimeframe: "1h" },
  { id: "chart-4", initialTimeframe: "4h" }
];

export function RealtimePage() {
  const connection = useRealtimeConnection();
  const isConnected = connection === "connected";

  return (
    <div className="realtime-page">
      <div className="realtime-heading">
        <div>
          <h1>Realtime Markets</h1>
          <p>Multi-timeframe market analysis.</p>
        </div>
        <div className="realtime-connection" data-realtime-connection={connection}>
          <span className="health-dot" />
          <span aria-label="Realtime connection status">
            {isConnected ? "Live" : "Reconnecting"}
          </span>
        </div>
      </div>

      <div className="chart-grid">
        {CHART_SLOTS.map((slot) => (
          <ChartWidget
            key={slot.id}
            id={slot.id}
            initialTimeframe={slot.initialTimeframe}
          />
        ))}
      </div>
    </div>
  );
}
