// Public registry tests for snapshot ordering, isolation, refresh, and bounded delivery.

import type {
  MarketLiveNotification,
  MarketRealtimeMessage,
  MarketSnapshotMessage,
  MarketSubscribeMessage
} from "@crypto-strategy-lab/api-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  MarketSubscriptionRegistry,
  type MarketClientSink,
  type MarketSnapshotReader
} from "./market-subscription-registry.js";

const subscribe = (subscriptionId: string, timeframe: "5m" | "1h"): MarketSubscribeMessage => ({
  schemaVersion: "v1", type: "market:subscribe", subscriptionId,
  symbol: "BTCUSDT", timeframe
});

const live = (
  timeframe: "5m" | "1h", revisionWatermark: number, sequence = revisionWatermark
): MarketLiveNotification => ({
  schemaVersion: "v1", type: "candle.closed", symbol: "BTCUSDT", timeframe,
  revisionWatermark, sequence,
  candle: {
    provider: "binance", symbol: "BTCUSDT", timeframe, openTime: revisionWatermark,
    closeTime: revisionWatermark + 1, open: 1, high: 2, low: 1, close: 2,
    volume: 3, closed: true, revision: 1
  }
});

const tick = (timeframe: "5m" | "1h", sequence: number): MarketLiveNotification => ({
  schemaVersion: "v1", type: "candle.tick", symbol: "BTCUSDT", timeframe,
  revisionWatermark: 0, sequence,
  candle: {
    provider: "binance", symbol: "BTCUSDT", timeframe, openTime: sequence * 100,
    closeTime: sequence * 100 + 1, open: 1, high: 2, low: 1, close: 2,
    volume: 3, closed: false, revision: 0
  }
});

function sink(writable = true): MarketClientSink & {
  readonly messages: MarketRealtimeMessage[];
  readonly disconnect: ReturnType<typeof vi.fn>;
  writable: boolean;
} {
  const messages: MarketRealtimeMessage[] = [];
  return {
    messages,
    writable,
    send(message) {
      if (!this.writable) return false;
      messages.push(message);
      return true;
    },
    disconnect: vi.fn()
  };
}

describe("MarketSubscriptionRegistry", () => {
  it("delivers the durable snapshot before live data that races the snapshot read", async () => {
    let resolveSnapshot: ((value: MarketSnapshotMessage) => void) | undefined;
    const reader: MarketSnapshotReader = {
      read: () => new Promise((resolve) => { resolveSnapshot = resolve; })
    };
    const client = sink();
    const registry = new MarketSubscriptionRegistry(reader, 4);
    const pending = registry.subscribe("client-1", subscribe("chart-1", "5m"), client);

    registry.publish(live("5m", 11));
    resolveSnapshot?.({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: "chart-1",
      symbol: "BTCUSDT", timeframe: "5m", revisionWatermark: 10, candles: []
    });
    await pending;

    expect(client.messages.map((message) => message.type)).toEqual([
      "market:snapshot", "candle.closed"
    ]);
  });

  it("routes live data only to subscriptions with the matching symbol and timeframe", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const first = sink();
    const second = sink();
    const registry = new MarketSubscriptionRegistry(reader, 4);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), first);
    await registry.subscribe("client-2", subscribe("chart-2", "1h"), second);

    registry.publish(live("5m", 2));

    expect(first.messages.map((message) => message.type)).toEqual([
      "market:snapshot", "candle.closed"
    ]);
    expect(second.messages.map((message) => message.type)).toEqual(["market:snapshot"]);
    expect(first.messages.at(-1)).toMatchObject({ subscriptionId: "chart-1" });
  });

  it("keeps two subscriptions on the same key independent and addresses each one", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const first = sink();
    const second = sink();
    const registry = new MarketSubscriptionRegistry(reader, 4);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), first);
    await registry.subscribe("client-1", subscribe("chart-2", "5m"), second);

    registry.publish(live("5m", 2));
    registry.unsubscribe("client-1", "chart-1");
    registry.publish(live("5m", 3));

    expect(first.messages.at(-1)).toMatchObject({
      type: "candle.closed", subscriptionId: "chart-1", revisionWatermark: 2
    });
    expect(second.messages.at(-1)).toMatchObject({
      type: "candle.closed", subscriptionId: "chart-2", revisionWatermark: 3
    });
    // Unsubscribe released the entry, so only the surviving subscription is left.
    expect(registry.subscriptionCount).toBe(1);
  });

  it("delivers a forming tick as its own message type without moving the watermark", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 5, candles: []
    }) };
    const client = sink();
    const registry = new MarketSubscriptionRegistry(reader, 4);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), client);

    registry.publish(tick("5m", 1));
    // A closed candle the snapshot already covers is dropped, so the overlap
    // reaches the chart once. The tick before it is display-only and still runs.
    registry.publish(live("5m", 5, 2));

    expect(client.messages.map((message) => message.type)).toEqual([
      "market:snapshot", "candle.tick"
    ]);
  });

  it("refreshes from a new durable snapshot after a notification sequence gap", async () => {
    let watermark = 1;
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe,
      revisionWatermark: watermark, candles: []
    }) };
    const client = sink();
    const registry = new MarketSubscriptionRegistry(reader, 4);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), client);
    registry.publish(live("5m", 2));
    watermark = 4;
    registry.publish(live("5m", 4));
    await vi.waitFor(() => expect(client.messages).toHaveLength(3));

    expect(client.messages.map((message) =>
      "revisionWatermark" in message ? message.revisionWatermark : -1
    )).toEqual([1, 2, 4]);
  });

  it("disconnects a slow client when its bounded outbound queue fills", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const client = sink(false);
    const registry = new MarketSubscriptionRegistry(reader, 2);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), client);
    registry.publish(live("5m", 2));
    registry.publish(live("5m", 3));

    expect(client.disconnect).toHaveBeenCalledWith("slow-client");
    expect(registry.subscriptionCount).toBe(0);
  });

  it("hits the same bound when the traffic that fills it is ticks", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const client = sink(false);
    const registry = new MarketSubscriptionRegistry(reader, 2);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), client);

    // Ticks are the high-rate channel, so they are what actually reaches the
    // bound first on a wedged socket.
    registry.publish(tick("5m", 2));
    registry.publish(tick("5m", 3));

    expect(client.disconnect).toHaveBeenCalledWith("slow-client");
    expect(registry.subscriptionCount).toBe(0);
  });

  it("never lets a tick move the watermark that guards the snapshot overlap", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const client = sink();
    const registry = new MarketSubscriptionRegistry(reader, 8);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), client);

    // A tick carrying a high watermark must not make the committed candle that
    // follows it look like something the snapshot already had.
    registry.publish({ ...tick("5m", 2), revisionWatermark: 99 });
    registry.publish(live("5m", 5, 3));

    expect(client.messages.map((message) => message.type)).toEqual([
      "market:snapshot", "candle.tick", "candle.closed"
    ]);
  });

  it("releases subscription state on unsubscribe and disconnect", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const registry = new MarketSubscriptionRegistry(reader, 4);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), sink());
    await registry.subscribe("client-1", subscribe("chart-2", "1h"), sink());
    registry.unsubscribe("client-1", "chart-1");
    expect(registry.subscriptionCount).toBe(1);
    registry.disconnect("client-1");
    expect(registry.subscriptionCount).toBe(0);
  });

  it("bounds total client buffering by limiting one client to four subscriptions", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const registry = new MarketSubscriptionRegistry(reader, 4);
    for (let index = 1; index <= 4; index += 1) {
      await registry.subscribe("client-1", subscribe(`chart-${index}`, "5m"), sink());
    }

    await expect(registry.subscribe("client-1", subscribe("chart-5", "5m"), sink()))
      .rejects.toThrow("WS_SUBSCRIPTION_LIMIT");
    expect(registry.subscriptionCount).toBe(4);
  });
});
