// The shared chart lifecycle. One stable chart identifier owns one live
// subscription, and this hook is the only place that opens, retargets, and
// releases it. Every chart on the page runs its own copy of this state, so a
// chart never sees another chart's candles and never shares its cleanup.

import type {
  ApiCandle,
  ApiFormingCandle,
  ApiTimeframe
} from "@crypto-strategy-lab/api-contracts";
import { useEffect, useMemo, useState } from "react";
import {
  getMarketRealtimeClient,
  type RealtimeConnectionState
} from "../api/market-realtime-client.js";

const CANDLE_COUNT = 150;

export interface ChartSubscriptionState {
  /** The committed series. A tick never enters it. */
  readonly durableCandles: readonly ApiCandle[];
  /** The durable series plus the forming bar, for rendering only. */
  readonly displayedCandles: readonly ApiCandle[];
  readonly formingCandle: ApiFormingCandle | null;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly snapshotCount: number;
  readonly tickCount: number;
  readonly closedCount: number;
  readonly snapshotWatermark: number | null;
}

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

/**
 * Reports the state of the one shared socket. It is connection state, not
 * subscription state: every chart reads the same value.
 */
export function useRealtimeConnection(): RealtimeConnectionState {
  const client = getMarketRealtimeClient();
  const [state, setState] = useState<RealtimeConnectionState>(() => client.connectionState);

  useEffect(() => {
    setState(client.connectionState);
    return client.onConnectionChange(setState);
  }, [client]);

  return state;
}

/**
 * Subscribes one chart. Changing `subscriptionId`, `symbol`, or `timeframe`
 * releases the previous subscription and opens the new one; no other chart is
 * touched, because no other chart runs this effect.
 */
export function useChartSubscription(
  subscriptionId: string,
  symbol: string,
  timeframe: ApiTimeframe
): ChartSubscriptionState {
  const [durableCandles, setDurableCandles] = useState<readonly ApiCandle[]>([]);
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
      { subscriptionId, symbol, timeframe }, {
      onSnapshot: (message) => {
        setDurableCandles(message.candles);
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
        setDurableCandles((current) => withClosedCandle(current, message.candle));
        setFormingCandle((current) =>
          current !== null && current.openTime <= message.candle.openTime ? null : current
        );
      },
      onError: (message) => {
        setDurableCandles([]);
        setFormingCandle(null);
        setErrorMessage(message);
        setIsLoading(false);
      }
    });
  }, [subscriptionId, symbol, timeframe]);

  // The forming bar is shown next to the durable series, never merged into it.
  const displayedCandles = useMemo<readonly ApiCandle[]>(() => {
    const last = lastOpenTime(durableCandles);
    if (formingCandle === null || (last !== undefined && formingCandle.openTime <= last)) {
      return durableCandles;
    }
    return [...durableCandles, formingCandle];
  }, [durableCandles, formingCandle]);

  return {
    durableCandles,
    displayedCandles,
    formingCandle,
    isLoading,
    errorMessage,
    snapshotCount,
    tickCount,
    closedCount,
    snapshotWatermark
  };
}
