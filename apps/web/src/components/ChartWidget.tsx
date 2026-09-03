// One live market chart. The widget owns presentation only: the subscription
// lifecycle lives in the shared chart hook, and the renderer below it still
// receives nothing but candles.

import type { ApiTimeframe } from "@crypto-strategy-lab/api-contracts";
import { useState } from "react";
import {
  useChartSubscription,
  useRealtimeConnection
} from "../hooks/use-chart-subscription.js";
import { CandlestickChart } from "./CandlestickChart.js";

interface ChartWidgetProps {
  /** The chart's stable identity. It is also its subscription identifier. */
  readonly id: string;
  readonly initialTimeframe: ApiTimeframe;
  readonly symbol?: string;
}

export function ChartWidget({ id, initialTimeframe, symbol = "BTCUSDT" }: ChartWidgetProps) {
  const [timeframe, setTimeframe] = useState<ApiTimeframe>(initialTimeframe);
  const connection = useRealtimeConnection();
  const {
    durableCandles,
    displayedCandles,
    formingCandle,
    isLoading,
    errorMessage,
    snapshotCount,
    tickCount,
    closedCount,
    snapshotWatermark
  } = useChartSubscription(id, symbol, timeframe);

  const durableLastOpenTime = durableCandles[durableCandles.length - 1]?.openTime;
  const liveUpdateCount = tickCount + closedCount;
  const subscriptionState = errorMessage !== null
    ? "error"
    : connection === "disconnected"
      ? "disconnected"
      : isLoading ? "subscribing" : "live";

  const selectId = `${id}-timeframe`;

  return (
    <div
      className="chart-widget"
      data-chart-id={id}
      data-closed-count={closedCount}
      data-connection={connection}
      data-durable-count={durableCandles.length}
      data-durable-last-open-time={durableLastOpenTime ?? ""}
      data-forming-open-time={formingCandle?.openTime ?? ""}
      data-live-update-count={liveUpdateCount}
      data-snapshot-count={snapshotCount}
      data-snapshot-watermark={snapshotWatermark ?? ""}
      data-subscription-state={subscriptionState}
      data-symbol={symbol}
      data-tick-count={tickCount}
      data-timeframe={timeframe}
    >
      <div className="chart-widget-header">
        <div className="chart-widget-info">
          <div className="chart-widget-symbol">
            <span className="health-dot" />
            <span>BTC/USDT</span>
          </div>
          <div className="chart-widget-meta">
            <span>{id}</span>
            <span aria-label={`Subscription state for ${id}`}>
              {subscriptionState}
            </span>
            <span aria-label={`Live updates for ${id}`}>
              Live updates: {liveUpdateCount}
            </span>
          </div>
        </div>
        <div className="chart-widget-controls">
          <label htmlFor={selectId}>Timeframe</label>
          <select
            aria-label={`Timeframe for ${id}`}
            id={selectId}
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value as ApiTimeframe)}
          >
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
        </div>
      </div>

      <div className="chart-widget-body">
        {isLoading && (
          <div className="chart-state">Loading market data...</div>
        )}

        {!isLoading && errorMessage !== null && (
          <div className="chart-state chart-error">
            <p>Failed to load market data</p>
            <p>{errorMessage}</p>
          </div>
        )}

        {!isLoading && errorMessage === null && displayedCandles.length === 0 && (
          <div className="chart-state">
            No candle data is available for this timeframe.
          </div>
        )}

        {!isLoading && errorMessage === null && displayedCandles.length > 0 && (
          <CandlestickChart state="ready" candles={displayedCandles} />
        )}
      </div>
    </div>
  );
}
