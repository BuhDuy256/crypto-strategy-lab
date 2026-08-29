// One live market chart: a durable candle series plus one separate forming bar.

import type {
  ApiCandle,
  ApiFormingCandle,
  ApiTimeframe
} from "@crypto-strategy-lab/api-contracts";
import { useEffect, useMemo, useState } from "react";
import { getMarketRealtimeClient } from "../api/market-realtime-client.js";
import { CandlestickChart } from "./CandlestickChart.js";

interface ChartWidgetProps {
  readonly id: string;
  readonly initialTimeframe: ApiTimeframe;
}

const CANDLE_COUNT = 150;

/**
 * Puts a committed candle into the durable series by identity. Replacing the
 * bar with the same open time is what makes a snapshot/live overlap apply once
 * instead of twice.
 */
function withClosedCandle(
  current: readonly ApiCandle[],
  candle: ApiCandle
): readonly ApiCandle[] {
  const others = current.filter((item) => item.openTime !== candle.openTime);
  return [...others, candle]
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-CANDLE_COUNT);
}

function lastOpenTime(candles: readonly ApiCandle[]): number | undefined {
  return candles[candles.length - 1]?.openTime;
}

export function ChartWidget({ id, initialTimeframe }: ChartWidgetProps) {
  const [timeframe, setTimeframe] = useState<ApiTimeframe>(initialTimeframe);
  const [data, setData] = useState<readonly ApiCandle[]>([]);
  const [formingCandle, setFormingCandle] = useState<ApiFormingCandle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [tickCount, setTickCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);
  const [snapshotWatermark, setSnapshotWatermark] = useState<number | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage(null);
    return getMarketRealtimeClient().subscribe(
      { subscriptionId: id, symbol: "BTCUSDT", timeframe }, {
      onSnapshot: (message) => {
        setData(message.candles);
        // A fresh snapshot is the new truth, so any bar that was forming
        // against the previous one is dropped rather than carried over.
        setFormingCandle(null);
        setSnapshotWatermark(message.revisionWatermark);
        setSnapshotCount((count) => count + 1);
        setErrorMessage(null);
        setIsLoading(false);
      },
      // A tick only moves the forming bar. It never enters the durable series.
      onTick: (message) => {
        setTickCount((count) => count + 1);
        setFormingCandle(message.candle);
      },
      onClosed: (message) => {
        setClosedCount((count) => count + 1);
        setData((current) => withClosedCandle(current, message.candle));
        setFormingCandle((current) =>
          current !== null && current.openTime <= message.candle.openTime ? null : current
        );
      },
      onError: (message) => {
        setData([]);
        setFormingCandle(null);
        setErrorMessage(message);
        setIsLoading(false);
      }
    });
  }, [id, timeframe]);

  // The forming bar is shown next to the durable series, never merged into it.
  const durableLastOpenTime = lastOpenTime(data);
  const displayedCandles = useMemo<readonly ApiCandle[]>(() => {
    const last = lastOpenTime(data);
    if (formingCandle === null || (last !== undefined && formingCandle.openTime <= last)) {
      return data;
    }
    return [...data, formingCandle];
  }, [data, formingCandle]);

  const liveUpdateCount = tickCount + closedCount;

  const selectId = `${id}-timeframe`;

  return (
    <div
      className="flex flex-col border border-gray-700/50 rounded-xl bg-gray-900 shadow-xl overflow-hidden h-[500px]"
      data-chart-id={id}
      data-closed-count={closedCount}
      data-durable-count={data.length}
      data-durable-last-open-time={durableLastOpenTime ?? ""}
      data-forming-open-time={formingCandle?.openTime ?? ""}
      data-live-update-count={liveUpdateCount}
      data-snapshot-count={snapshotCount}
      data-snapshot-watermark={snapshotWatermark ?? ""}
      data-tick-count={tickCount}
    >
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700/50 bg-[#1e222d]/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-gray-100 font-bold text-base tracking-wide">BTC/USDT</span>
          </div>
          <span className="text-xs text-blue-400 font-mono bg-blue-900/20 border border-blue-800/30 px-2 py-1 rounded-md">
            {id}
          </span>
          <span className="text-xs text-green-400" aria-label={`Live updates for ${id}`}>
            Live updates: {liveUpdateCount}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="text-xs text-gray-500 font-semibold uppercase tracking-widest"
            htmlFor={selectId}
          >
            Timeframe
          </label>
          <select
            aria-label={`Timeframe for ${id}`}
            className="bg-[#2a2e39] hover:bg-[#363a45] text-gray-200 border-none rounded px-3 py-1.5 text-sm font-medium outline-none transition-colors cursor-pointer shadow-inner"
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

      <div className="flex-1 relative w-full h-full bg-[#131722]">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]/90 backdrop-blur-sm">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-blue-400 text-sm font-semibold tracking-wide">
                Loading market data...
              </span>
            </div>
          </div>
        )}

        {!isLoading && errorMessage !== null && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]">
            <div className="text-center p-8 bg-red-950/20 rounded-xl border border-red-900/30">
              <p className="text-red-400 font-bold mb-2 text-lg">Failed to load market data</p>
              <p className="text-red-500/60 text-sm">{errorMessage}</p>
            </div>
          </div>
        )}

        {!isLoading && errorMessage === null && displayedCandles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
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
