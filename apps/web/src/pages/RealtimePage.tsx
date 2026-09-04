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
    <section className="realtime-page">
      <div className="realtime-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">Realtime Markets</h1>
          <div
            className="flex items-center gap-2 border border-gray-700/60 rounded-full px-3 py-1.5 bg-gray-900"
            data-realtime-connection={connection}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500 animate-pulse" : "bg-yellow-500 animate-pulse"
              }`}
            />
            <span
              aria-label="Realtime connection status"
              className={`text-xs font-semibold uppercase tracking-widest ${
                isConnected ? "text-green-400" : "text-yellow-400"
              }`}
            >
              {isConnected ? "Live" : "Reconnecting"}
            </span>
          </div>
        </div>
        <p className="text-gray-400 mt-2 text-base md:text-lg font-medium">Multi-timeframe market analysis.</p>
      </div>

      <div className="realtime-grid">
        {CHART_SLOTS.map((slot) => (
          <ChartWidget
            key={slot.id}
            id={slot.id}
            initialTimeframe={slot.initialTimeframe}
          />
        ))}
      </div>
    </section>
  );
}
