// Gateway transport regression tests: durable messages queue, ephemeral ticks do not.

import type {
  MarketLiveNotification,
  MarketSubscribeMessage
} from "@crypto-strategy-lab/api-contracts";
import type { Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";
import type { MarketSnapshotQuery } from "../market/index.js";
import { RedisLiveNotificationSubscriber } from "../../platform/realtime/redis-live-notifications.js";
import { MarketRealtimeGateway } from "./market-realtime.gateway.js";

class FakeSocket {
  readonly id = "client-1";
  connected = true;
  readonly emitted: { event: string; body: unknown }[] = [];
  readonly volatile = { emit: vi.fn() };
  readonly conn = {
    transport: {
      writable: true,
      on: vi.fn()
    }
  };
  readonly disconnect = vi.fn(() => {
    this.connected = false;
  });

  emit(event: string, body: unknown): void {
    this.emitted.push({ event, body });
  }
}

const subscribe: MarketSubscribeMessage = {
  schemaVersion: "v1",
  type: "market:subscribe",
  subscriptionId: "chart-1",
  symbol: "BTCUSDT",
  timeframe: "5m"
};

function tick(sequence: number): MarketLiveNotification {
  return {
    schemaVersion: "v1",
    type: "candle.tick",
    symbol: "BTCUSDT",
    timeframe: "5m",
    revisionWatermark: 0,
    sequence,
    candle: {
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "5m",
      openTime: sequence * 300_000,
      closeTime: sequence * 300_000 + 299_999,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 3,
      closed: false,
      revision: 0
    }
  };
}

describe("MarketRealtimeGateway transport", () => {
  it("uses volatile delivery for ticks while the Socket.IO transport is busy", async () => {
    let publish: ((message: MarketLiveNotification) => void) | undefined;
    const subscriber = {
      start(onMessage: (message: MarketLiveNotification) => void): Promise<void> {
        publish = onMessage;
        return Promise.resolve();
      }
    } as unknown as RedisLiveNotificationSubscriber;
    const snapshots = {
      getLatestSnapshot: async () => ({ candles: [], revisionWatermark: 0 })
    } as unknown as MarketSnapshotQuery;
    const gateway = new MarketRealtimeGateway(snapshots, subscriber, 32, 4);
    const socket = new FakeSocket();

    gateway.handleConnection(socket as unknown as Socket);
    await gateway.subscribe(socket as unknown as Socket, subscribe);
    socket.conn.transport.writable = false;

    for (let sequence = 1; sequence <= 33; sequence += 1) publish?.(tick(sequence));

    expect(socket.volatile.emit).toHaveBeenCalledTimes(33);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(gateway.activeSubscriptionCount).toBe(1);
  });
});
