// Real Redis integration test for cross-client ephemeral Pub/Sub fan-out.

import type { MarketLiveMessage } from "@crypto-strategy-lab/api-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { StructuredLogger } from "../logger.js";
import {
  RedisLiveNotificationPublisher,
  RedisLiveNotificationSubscriber
} from "./redis-live-notifications.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const resources: { close(): Promise<void> }[] = [];

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
    let resolveMessage: ((message: MarketLiveMessage) => void) | undefined;
    const received = new Promise<MarketLiveMessage>((resolve) => { resolveMessage = resolve; });
    await subscriber.start((message) => resolveMessage?.(message), () => undefined);
    const message: MarketLiveMessage = {
      schemaVersion: "v1", type: "market:live", symbol: "BTCUSDT", timeframe: "5m",
      revisionWatermark: 7, sequence: 1,
      candle: {
        provider: "binance", symbol: "BTCUSDT", timeframe: "5m", openTime: 1,
        closeTime: 2, open: 1, high: 2, low: 1, close: 2,
        volume: 3, closed: true, revision: 1
      }
    };

    await publisher.publish(message);

    await expect(received).resolves.toEqual(message);
  });
});
