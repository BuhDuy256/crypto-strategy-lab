// Redis Pub/Sub adapters for ephemeral, at-most-once market notifications.

import {
  isMarketLiveNotification,
  type MarketLiveNotification
} from "@crypto-strategy-lab/api-contracts";
import { createClient, type RedisClientType } from "redis";
import type { StructuredLogger } from "../logger.js";
import type { LiveNotificationTransport } from "./committed-live-publisher.js";

export const MARKET_LIVE_CHANNEL = "crypto-strategy-lab:market-live:v1";
const PUBLISH_TIMEOUT_MS = 1_000;

export class RedisLiveNotificationPublisher implements LiveNotificationTransport {
  private readonly client: RedisClientType;

  constructor(redisUrl: string, private readonly logger: StructuredLogger) {
    this.client = createClient({
      url: redisUrl,
      // Pub/Sub is best-effort. A publisher retries on the next market update;
      // it must not retain an offline command queue or a reconnect loop that
      // can hold the authoritative ingest path open.
      disableOfflineQueue: true,
      socket: {
        connectTimeout: PUBLISH_TIMEOUT_MS,
        reconnectStrategy: false
      }
    });
    this.client.on("error", (error: Error) => {
      this.logger.warn(`Redis live publisher error: ${error.message}`, "RealtimePubSub");
    });
  }

  async publish(message: MarketLiveNotification): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.publishNow(message),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            if (this.client.isOpen) this.client.destroy();
            reject(new Error(`Redis live publication timed out after ${PUBLISH_TIMEOUT_MS}ms`));
          }, PUBLISH_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private async publishNow(message: MarketLiveNotification): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
    if (!this.client.isReady) {
      throw new Error("Redis live publisher is not ready");
    }
    await this.client.publish(MARKET_LIVE_CHANNEL, JSON.stringify(message));
  }

  async close(): Promise<void> {
    if (this.client.isReady) await this.client.quit();
    else if (this.client.isOpen) this.client.destroy();
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
    onMessage: (message: MarketLiveNotification) => void,
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
        if (isMarketLiveNotification(parsed)) onMessage(parsed);
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
