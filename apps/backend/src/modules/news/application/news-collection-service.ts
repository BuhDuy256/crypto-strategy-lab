// Collector lifecycle and schedule for News-only RSS collection.

import { deduplicateNewsItems } from "../domain/news-item.js";
import type { NewsCollectionStore } from "./news-collection-store.js";
import type { NewsProvider } from "./news-provider.js";

export interface NewsCollectionLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

export interface NewsCollectionResult {
  readonly status: "healthy" | "degraded";
  readonly provider: string;
  readonly fetchedCount: number;
  readonly storedCount: number;
  readonly skippedCount: number;
}

const CONTEXT = "NewsCollection";

/** Collects through NewsProvider and commits only through the News-owned batch seam. */
export class NewsCollectionService {
  constructor(
    private readonly provider: NewsProvider,
    private readonly store: NewsCollectionStore,
    private readonly logger: NewsCollectionLogger,
    private readonly now: () => number = Date.now
  ) {}

  async collectNow(): Promise<NewsCollectionResult> {
    try {
      const fetched = await this.provider.fetchLatest();
      const items = deduplicateNewsItems(fetched);
      const health = await this.provider.getHealth();
      const stored = await this.store.storeCollectedBatch({
        items,
        health: { provider: health.provider, status: "healthy", checkedAt: this.now() }
      });
      const result = {
        status: "healthy" as const,
        provider: health.provider,
        fetchedCount: fetched.length,
        storedCount: stored.storedCount,
        skippedCount: stored.skippedCount + fetched.length - items.length
      };
      this.logger.log(
        `Collected ${result.storedCount} News item(s); skipped ${result.skippedCount}.`,
        CONTEXT
      );
      return result;
    } catch (error: unknown) {
      return this.recordProviderFailure(error);
    }
  }

  private async recordProviderFailure(error: unknown): Promise<NewsCollectionResult> {
    const reason = error instanceof Error ? error.message : "unknown collection failure";
    let provider = "news-provider";
    try {
      provider = (await this.provider.getHealth()).provider;
      await this.store.storeCollectedBatch({
        items: [],
        health: { provider, status: "degraded", checkedAt: this.now(), reason }
      });
    } catch (healthWriteError: unknown) {
      const healthWriteReason = healthWriteError instanceof Error
        ? healthWriteError.message
        : "unknown health persistence failure";
      this.logger.error(
        `Collection failed and degraded health could not be persisted: ${healthWriteReason}`,
        CONTEXT
      );
    }
    this.logger.warn(`Collection degraded for ${provider}: ${reason}`, CONTEXT);
    return {
      status: "degraded",
      provider,
      fetchedCount: 0,
      storedCount: 0,
      skippedCount: 0
    };
  }
}

export interface NewsCollectionTimer {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemTimer: NewsCollectionTimer = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
};

/** Offers explicit manual collection and a single non-overlapping timer registration. */
export class NewsCollectionScheduler {
  private handle: unknown | undefined;

  constructor(
    private readonly collector: NewsCollectionService,
    private readonly pollIntervalMs: number,
    private readonly timer: NewsCollectionTimer = systemTimer
  ) {}

  async collectManually(): Promise<NewsCollectionResult> {
    return this.collector.collectNow();
  }

  async collectOnSchedule(): Promise<NewsCollectionResult> {
    return this.collector.collectNow();
  }

  start(): void {
    if (this.handle !== undefined) return;
    this.handle = this.timer.setInterval(() => { void this.collectOnSchedule(); }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.handle === undefined) return;
    this.timer.clearInterval(this.handle);
    this.handle = undefined;
  }
}
