// Public registry tests for snapshot ordering, isolation, refresh, and bounded delivery.

import type {
  MarketLiveMessage,
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

const live = (timeframe: "5m" | "1h", revisionWatermark: number): MarketLiveMessage => ({
  schemaVersion: "v1", type: "market:live", symbol: "BTCUSDT", timeframe,
  revisionWatermark, sequence: revisionWatermark,
  candle: {
    provider: "binance", symbol: "BTCUSDT", timeframe, openTime: revisionWatermark,
    closeTime: revisionWatermark + 1, open: 1, high: 2, low: 1, close: 2,
    volume: 3, closed: true, revision: 1
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
      "market:snapshot", "market:live"
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

    expect(first.messages.map((message) => message.type)).toEqual(["market:snapshot", "market:live"]);
    expect(second.messages.map((message) => message.type)).toEqual(["market:snapshot"]);
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
