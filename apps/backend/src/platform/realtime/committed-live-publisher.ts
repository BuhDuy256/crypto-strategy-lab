// Orders an authoritative commit before an optional best-effort live notification.

import type { MarketLiveNotification } from "@crypto-strategy-lab/api-contracts";

export interface LiveNotificationTransport {
  publish(message: MarketLiveNotification): Promise<void>;
}

export interface CommitAndPublishResult<T> {
  readonly value: T;
  readonly published: boolean;
}

export interface LivePublishFailureReporter {
  warn(message: string, context?: string): void;
}

export class CommittedLivePublisher {
  constructor(
    private readonly transport: LiveNotificationTransport,
    private readonly logger: LivePublishFailureReporter
  ) {}

  async commitAndPublish<T>(
    commit: () => Promise<T>,
    notification: (value: T) => MarketLiveNotification
  ): Promise<CommitAndPublishResult<T>> {
    const value = await commit();
    try {
      await this.transport.publish(notification(value));
      return { value, published: true };
    } catch (error: unknown) {
      // The commit is authoritative. Pub/Sub is deliberately best-effort and a
      // later durable snapshot repairs any notification loss.
      const message = error instanceof Error ? error.message : "unknown publication error";
      this.logger.warn(`Live notification was not published: ${message}`, "RealtimePubSub");
      return { value, published: false };
    }
  }
}
