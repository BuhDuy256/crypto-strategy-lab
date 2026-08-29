// Public client tests for subscribe, reconnect snapshot gating, isolation, and cleanup.

import type { MarketRealtimeMessage } from "@crypto-strategy-lab/api-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  getMarketRealtimeClient,
  MarketRealtimeClient,
  type RealtimeConnectionState,
  type RealtimeSocket
} from "./market-realtime-client.js";

const { io } = vi.hoisted(() => ({ io: vi.fn(() => ({
  connected: false, on: vi.fn(), emit: vi.fn()
})) }));
vi.mock("socket.io-client", () => ({ io }));

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
      { onSnapshot: snapshots, onTick: vi.fn(), onClosed: lives, onError: vi.fn() }
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
      { onSnapshot: vi.fn(), onTick: vi.fn(), onClosed: first, onError: vi.fn() }
    );
    client.subscribe(
      { subscriptionId: "chart-2", symbol: "BTCUSDT", timeframe: "1h" },
      { onSnapshot: vi.fn(), onTick: vi.fn(), onClosed: second, onError: vi.fn() }
    );
    socket.trigger("market:message", snapshot("chart-1", "5m"));
    socket.trigger("market:message", snapshot("chart-2", "1h"));
    socket.trigger("market:message", live(2));
    // Addressed to chart-1, and its key does not match chart-2 either.
    socket.trigger("market:message", live(3, "chart-2"));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    unsubscribe();
    expect(socket.emitted.at(-1)).toEqual({
      event: "market:unsubscribe",
      body: { schemaVersion: "v1", type: "market:unsubscribe", subscriptionId: "chart-1" }
    });
  });

  it("routes a tick and a closed candle to separate handlers", () => {
    const socket = new FakeSocket();
    const ticks = vi.fn();
    const closes = vi.fn();
    const client = new MarketRealtimeClient(socket);
    client.subscribe(
      { subscriptionId: "chart-1", symbol: "BTCUSDT", timeframe: "5m" },
      { onSnapshot: vi.fn(), onTick: ticks, onClosed: closes, onError: vi.fn() }
    );
    socket.trigger("market:message", snapshot("chart-1", "5m"));
    socket.trigger("market:message", tick(60));
    socket.trigger("market:message", live(2));

    expect(ticks).toHaveBeenCalledTimes(1);
    expect(closes).toHaveBeenCalledTimes(1);
    expect(ticks.mock.calls[0]?.[0]).toMatchObject({ type: "candle.tick" });
    expect(closes.mock.calls[0]?.[0]).toMatchObject({ type: "candle.closed" });
  });
});

function snapshot(subscriptionId: string, timeframe: "5m" | "1h"): MarketRealtimeMessage {
  return {
    schemaVersion: "v1", type: "market:snapshot", subscriptionId,
    symbol: "BTCUSDT", timeframe, revisionWatermark: 1, candles: []
  };
}

function live(
  revisionWatermark: number,
  subscriptionId = "chart-1"
): MarketRealtimeMessage {
  return {
    schemaVersion: "v1", type: "candle.closed", subscriptionId,
    symbol: "BTCUSDT", timeframe: "5m",
    revisionWatermark, sequence: revisionWatermark,
    candle: {
      provider: "binance", symbol: "BTCUSDT", timeframe: "5m", openTime: revisionWatermark,
      closeTime: revisionWatermark + 1, open: 1, high: 2, low: 1, close: 2,
      volume: 3, closed: true, revision: 1
    }
  };
}

function tick(
  openTime: number,
  subscriptionId = "chart-1"
): MarketRealtimeMessage {
  return {
    schemaVersion: "v1", type: "candle.tick", subscriptionId,
    symbol: "BTCUSDT", timeframe: "5m",
    revisionWatermark: 0, sequence: openTime,
    candle: {
      provider: "binance", symbol: "BTCUSDT", timeframe: "5m", openTime,
      closeTime: openTime + 1, open: 1, high: 2, low: 1, close: 2,
      volume: 3, closed: false, revision: 0
    }
  };
}

describe("MarketRealtimeClient shared connection", () => {
  it("carries every subscription on one socket and resubscribes them all on reconnect", () => {
    const socket = new FakeSocket();
    const client = new MarketRealtimeClient(socket);
    const charts = ["chart-1", "chart-2", "chart-3", "chart-4"] as const;
    const timeframes = ["5m", "15m", "1h", "4h"] as const;
    charts.forEach((subscriptionId, index) => {
      client.subscribe(
        { subscriptionId, symbol: "BTCUSDT", timeframe: timeframes[index] ?? "5m" },
        { onSnapshot: vi.fn(), onTick: vi.fn(), onClosed: vi.fn(), onError: vi.fn() }
      );
    });
    expect(socket.emitted).toHaveLength(4);

    socket.trigger("connect");

    // One reconnect on one socket restores four subscriptions. Four sockets
    // would have produced four independent lifecycles instead.
    expect(socket.emitted.slice(4).map((entry) => entry.event))
      .toEqual(["market:subscribe", "market:subscribe", "market:subscribe", "market:subscribe"]);
    expect(socket.emitted.slice(4).map((entry) =>
      (entry.body as { readonly subscriptionId: string }).subscriptionId)).toEqual([...charts]);
  });

  it("reports the socket lifecycle and stops reporting once the listener is released", () => {
    const socket = new FakeSocket();
    const client = new MarketRealtimeClient(socket);
    const seen: RealtimeConnectionState[] = [];
    const release = client.onConnectionChange((state) => seen.push(state));

    expect(client.connectionState).toBe("connected");
    socket.trigger("disconnect");
    socket.trigger("connect");
    release();
    socket.trigger("disconnect");

    expect(seen).toEqual(["disconnected", "connected"]);
  });

  it("hands every caller the same client, so the page opens one socket", () => {
    expect(getMarketRealtimeClient()).toBe(getMarketRealtimeClient());
    expect(io).toHaveBeenCalledTimes(1);
  });
});
