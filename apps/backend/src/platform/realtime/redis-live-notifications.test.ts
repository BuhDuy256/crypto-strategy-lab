// Real Redis integration test for cross-client ephemeral Pub/Sub fan-out.

import type { MarketLiveNotification } from "@crypto-strategy-lab/api-contracts";
import type { AddressInfo, Socket } from "node:net";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { StructuredLogger } from "../logger.js";
import {
  RedisLiveNotificationPublisher,
  RedisLiveNotificationSubscriber
} from "./redis-live-notifications.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const resources: { close(): Promise<void> }[] = [];

const message: MarketLiveNotification = {
  schemaVersion: "v1", type: "candle.closed", symbol: "BTCUSDT", timeframe: "5m",
  revisionWatermark: 7, sequence: 1,
  candle: {
    provider: "binance", symbol: "BTCUSDT", timeframe: "5m", openTime: 1,
    closeTime: 2, open: 1, high: 2, low: 1, close: 2,
    volume: 3, closed: true, revision: 1
  }
};

async function startUnresponsiveRedisEndpoint(): Promise<string> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  resources.push({
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve, reject) => server.close((error) => {
        if (error !== undefined) reject(error);
        else resolve();
      }));
    }
  });
  return `redis://127.0.0.1:${port}`;
}

afterEach(async () => {
  await Promise.all(resources.splice(0).map((resource) => resource.close()));
});

describe("Redis live notification adapters", () => {
  it("fans a versioned live message between independent Redis clients", async () => {
    const subscriber = new RedisLiveNotificationSubscriber(
      redisUrl, new StructuredLogger("redis-test")
    );
    const publisher = new RedisLiveNotificationPublisher(
      redisUrl, new StructuredLogger("redis-test")
    );
    resources.push(subscriber, publisher);
    let resolveMessage: ((message: MarketLiveNotification) => void) | undefined;
    const received = new Promise<MarketLiveNotification>((resolve) => { resolveMessage = resolve; });
    await subscriber.start((message) => resolveMessage?.(message), () => undefined);
    await publisher.publish(message);

    await expect(received).resolves.toEqual(message);
  });

  it("rejects a publication instead of reconnecting or queuing without a bound", async () => {
    const endpoint = await startUnresponsiveRedisEndpoint();
    const publisher = new RedisLiveNotificationPublisher(
      endpoint, new StructuredLogger("redis-test")
    );

    await expect(publisher.publish(message)).rejects.toThrow();
    await expect(publisher.publish({ ...message, sequence: 2 })).rejects.toThrow();
  }, 3_000);
});
