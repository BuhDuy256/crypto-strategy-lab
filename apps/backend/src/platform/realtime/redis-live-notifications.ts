// Redis Pub/Sub adapters for ephemeral, at-most-once market notifications.

import {
  isMarketRealtimeMessage,
  type MarketLiveMessage
} from "@crypto-strategy-lab/api-contracts";
import { createClient, type RedisClientType } from "redis";
import type { StructuredLogger } from "../logger.js";
import type { LiveNotificationTransport } from "./committed-live-publisher.js";

export const MARKET_LIVE_CHANNEL = "crypto-strategy-lab:market-live:v1";

export class RedisLiveNotificationPublisher implements LiveNotificationTransport {
  private readonly client: RedisClientType;

  constructor(redisUrl: string, private readonly logger: StructuredLogger) {
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (error: Error) => {
      this.logger.warn(`Redis live publisher error: ${error.message}`, "RealtimePubSub");
    });
  }

  async publish(message: MarketLiveMessage): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
    await this.client.publish(MARKET_LIVE_CHANNEL, JSON.stringify(message));
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}

export class RedisLiveNotificationSubscriber {
  private readonly client: RedisClientType;
  private started = false;
  private onRecovery: (() => void | Promise<void>) | undefined;

  constructor(redisUrl: string, private readonly logger: StructuredLogger) {
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (error: Error) => {
      this.logger.warn(`Redis live notifications unavailable: ${error.message}`, "RealtimePubSub");
    });
    this.client.on("ready", () => {
      // Refresh on first connection too: Redis may have been unavailable while
      // the API was already serving durable snapshots and notifications were lost.
      void this.onRecovery?.();
    });
  }

  start(
    onMessage: (message: MarketLiveMessage) => void,
    onRecovery: () => void | Promise<void>
  ): Promise<void> {
    if (this.started) return Promise.resolve();
    this.started = true;
    this.onRecovery = onRecovery;
    return this.client.connect()
      .then(async () => this.client.subscribe(MARKET_LIVE_CHANNEL, (raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          this.logger.warn("Ignored malformed Redis live notification", "RealtimePubSub");
          return;
        }
        if (isMarketRealtimeMessage(parsed) && parsed.type === "market:live") onMessage(parsed);
      }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "unknown Redis error";
        this.logger.warn(`Redis live subscriber did not start: ${message}`, "RealtimePubSub");
      });
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
