// Public client tests for subscribe, reconnect snapshot gating, isolation, and cleanup.

import type { MarketRealtimeMessage } from "@crypto-strategy-lab/api-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  MarketRealtimeClient,
  type RealtimeSocket
} from "./market-realtime-client.js";

class FakeSocket implements RealtimeSocket {
  connected = true;
  readonly emitted: { event: string; body: unknown }[] = [];
  private readonly handlers = new Map<string, ((body?: unknown) => void)[]>();

  on(event: string, handler: (body?: unknown) => void): void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  emit(event: string, body: unknown): void {
    this.emitted.push({ event, body });
  }

  trigger(event: string, body?: MarketRealtimeMessage): void {
    for (const handler of this.handlers.get(event) ?? []) handler(body);
  }
}

describe("MarketRealtimeClient", () => {
  it("requires a fresh snapshot before delivering live messages after reconnect", () => {
    const socket = new FakeSocket();
    const snapshots = vi.fn();
    const lives = vi.fn();
    const client = new MarketRealtimeClient(socket);
    client.subscribe(
      { subscriptionId: "chart-1", symbol: "BTCUSDT", timeframe: "5m" },
      { onSnapshot: snapshots, onLive: lives, onError: vi.fn() }
    );
    socket.trigger("market:message", {
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
      symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 1, candles: []
    });
    socket.trigger("disconnect");
    socket.trigger("connect");
    socket.trigger("market:message", live(2));
    expect(lives).not.toHaveBeenCalled();

    socket.trigger("market:message", {
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
      symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 2, candles: []
    });
    socket.trigger("market:message", live(3));

    expect(snapshots).toHaveBeenCalledTimes(2);
    expect(lives).toHaveBeenCalledTimes(1);
    expect(socket.emitted.filter(({ event }) => event === "market:subscribe")).toHaveLength(2);
  });

  it("isolates keys and releases server state when unsubscribed", () => {
    const socket = new FakeSocket();
    const first = vi.fn();
    const second = vi.fn();
    const client = new MarketRealtimeClient(socket);
    const unsubscribe = client.subscribe(
      { subscriptionId: "chart-1", symbol: "BTCUSDT", timeframe: "5m" },
      { onSnapshot: vi.fn(), onLive: first, onError: vi.fn() }
    );
    client.subscribe(
      { subscriptionId: "chart-2", symbol: "BTCUSDT", timeframe: "1h" },
      { onSnapshot: vi.fn(), onLive: second, onError: vi.fn() }
    );
    socket.trigger("market:message", snapshot("chart-1", "5m"));
    socket.trigger("market:message", snapshot("chart-2", "1h"));
    socket.trigger("market:message", live(2));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    unsubscribe();
    expect(socket.emitted.at(-1)).toEqual({
      event: "market:unsubscribe",
      body: { schemaVersion: "v1", type: "market:unsubscribe", subscriptionId: "chart-1" }
    });
  });
});

function snapshot(subscriptionId: string, timeframe: "5m" | "1h"): MarketRealtimeMessage {
  return {
    schemaVersion: "v1", type: "market:snapshot", subscriptionId,
    symbol: "BTCUSDT", timeframe, revisionWatermark: 1, candles: []
  };
}

function live(revisionWatermark: number): MarketRealtimeMessage {
  return {
    schemaVersion: "v1", type: "market:live", symbol: "BTCUSDT", timeframe: "5m",
    revisionWatermark, sequence: revisionWatermark,
    candle: {
      provider: "binance", symbol: "BTCUSDT", timeframe: "5m", openTime: revisionWatermark,
      closeTime: revisionWatermark + 1, open: 1, high: 2, low: 1, close: 2,
      volume: 3, closed: true, revision: 1
    }
  };
}
