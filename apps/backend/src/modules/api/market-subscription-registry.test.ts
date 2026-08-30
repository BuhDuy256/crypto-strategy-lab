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

// Wide enough that no test below trips it by accident. The per-client bound is
// configured, so these tests never depend on a particular number of charts.
const SUBSCRIPTION_MAX = 32;

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
    const registry = new MarketSubscriptionRegistry(reader, 4, SUBSCRIPTION_MAX);
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
    const registry = new MarketSubscriptionRegistry(reader, 4, SUBSCRIPTION_MAX);
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
    const registry = new MarketSubscriptionRegistry(reader, 4, SUBSCRIPTION_MAX);
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
    const registry = new MarketSubscriptionRegistry(reader, 4, SUBSCRIPTION_MAX);
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
    const registry = new MarketSubscriptionRegistry(reader, 4, SUBSCRIPTION_MAX);
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
    const registry = new MarketSubscriptionRegistry(reader, 2, SUBSCRIPTION_MAX);
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
    const registry = new MarketSubscriptionRegistry(reader, 2, SUBSCRIPTION_MAX);
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
    const registry = new MarketSubscriptionRegistry(reader, 8, SUBSCRIPTION_MAX);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), client);

    // A tick carrying a high watermark must not make the committed candle that
    // follows it look like something the snapshot already had.
    registry.publish({ ...tick("5m", 2), revisionWatermark: 99 });
    registry.publish(live("5m", 5, 3));

    expect(client.messages.map((message) => message.type)).toEqual([
      "market:snapshot", "candle.tick", "candle.closed"
    ]);
  });

  it("holds one entry per subscription and addresses live data to only the matching one", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const registry = new MarketSubscriptionRegistry(reader, 8, SUBSCRIPTION_MAX);
    // The page opens four charts here. The registry is given four subscriptions
    // and counts four; it is never told that four is the expected number.
    const charts = [
      { id: "chart-1", timeframe: "5m" as const, sink: sink() },
      { id: "chart-2", timeframe: "1h" as const, sink: sink() },
      { id: "chart-3", timeframe: "5m" as const, sink: sink() },
      { id: "chart-4", timeframe: "1h" as const, sink: sink() }
    ];
    for (const chart of charts) {
      await registry.subscribe("client-1", subscribe(chart.id, chart.timeframe), chart.sink);
    }

    expect(registry.subscriptionCount).toBe(4);
    // Each chart got its own snapshot, stamped with its own identifier.
    expect(charts.map((chart) => chart.sink.messages.map((message) => message.type))).toEqual([
      ["market:snapshot"], ["market:snapshot"], ["market:snapshot"], ["market:snapshot"]
    ]);

    registry.publish(live("1h", 2));

    const delivered = charts.map((chart) => chart.sink.messages
      .filter((message) => message.type === "candle.closed")
      .map((message) => (message as { readonly subscriptionId: string }).subscriptionId));
    // Only the two subscriptions on the 1h key saw it, each addressed to itself.
    expect(delivered).toEqual([[], ["chart-2"], [], ["chart-4"]]);
    expect(registry.subscriptionCount).toBe(4);
  });

  it("keeps the entry total unchanged when one identifier is retargeted", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const registry = new MarketSubscriptionRegistry(reader, 8, SUBSCRIPTION_MAX);
    const untouched = sink();
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), sink());
    await registry.subscribe("client-1", subscribe("chart-2", "1h"), untouched);
    await registry.subscribe("client-1", subscribe("chart-3", "1h"), sink());
    await registry.subscribe("client-1", subscribe("chart-4", "5m"), sink());
    expect(registry.subscriptionCount).toBe(4);

    // A timeframe change is unsubscribe plus subscribe for one identifier only.
    registry.unsubscribe("client-1", "chart-1");
    expect(registry.subscriptionCount).toBe(3);
    const retargeted = sink();
    await registry.subscribe("client-1", subscribe("chart-1", "1h"), retargeted);

    expect(registry.subscriptionCount).toBe(4);
    const before = untouched.messages.length;
    registry.publish(live("1h", 2));
    // The retargeted subscription now receives its new key, and a subscription
    // that was never touched keeps receiving without a new snapshot.
    expect(retargeted.messages.map((message) => message.type))
      .toEqual(["market:snapshot", "candle.closed"]);
    expect(untouched.messages.length).toBe(before + 1);
    expect(untouched.messages.filter((message) => message.type === "market:snapshot")).toHaveLength(1);
  });

  it("releases subscription state on unsubscribe and disconnect", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    const registry = new MarketSubscriptionRegistry(reader, 4, SUBSCRIPTION_MAX);
    await registry.subscribe("client-1", subscribe("chart-1", "5m"), sink());
    await registry.subscribe("client-1", subscribe("chart-2", "1h"), sink());
    await registry.subscribe("client-2", subscribe("chart-1", "5m"), sink());
    registry.unsubscribe("client-1", "chart-1");
    expect(registry.subscriptionCount).toBe(2);

    registry.disconnect("client-1");

    // Closing one page releases that page's entries and nobody else's.
    expect(registry.subscriptionCount).toBe(1);
    registry.disconnect("client-2");
    expect(registry.subscriptionCount).toBe(0);
  });

  it("bounds total client buffering at the configured subscription limit", async () => {
    const reader: MarketSnapshotReader = { read: async (request) => ({
      schemaVersion: "v1", type: "market:snapshot", subscriptionId: request.subscriptionId,
      symbol: request.symbol, timeframe: request.timeframe, revisionWatermark: 1, candles: []
    }) };
    // Three, not four: the bound is whatever it is configured to be, and the
    // registry holds no idea of how many charts a page shows.
    const registry = new MarketSubscriptionRegistry(reader, 4, 3);
    for (let index = 1; index <= 3; index += 1) {
      await registry.subscribe("client-1", subscribe(`chart-${index}`, "5m"), sink());
    }

    await expect(registry.subscribe("client-1", subscribe("chart-4", "5m"), sink()))
      .rejects.toThrow("WS_SUBSCRIPTION_LIMIT");
    expect(registry.subscriptionCount).toBe(3);
  });
});
