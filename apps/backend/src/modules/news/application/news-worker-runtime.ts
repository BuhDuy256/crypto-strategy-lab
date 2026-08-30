// Process-lifetime wrapper for the isolated News collection worker.

import type { NewsCollectionResult } from "./news-collection-service.js";

export interface NewsWorkerSchedule {
  collectManually(): Promise<NewsCollectionResult>;
  collectOnSchedule(): Promise<NewsCollectionResult>;
  start(): void;
  stop(): void;
}

export interface NewsWorkerLogger {
  log(message: string, context?: string): void;
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

/** Runs the News schedule only; API, market ingest, and backtesting have separate roles. */
export class NewsWorkerRuntime {
  constructor(
    private readonly schedule: NewsWorkerSchedule,
    private readonly logger: NewsWorkerLogger
  ) {}

  async collectOnce(): Promise<NewsCollectionResult> {
    const result = await this.schedule.collectManually();
    this.logger.log(
      `Manual News collection is ${result.status}: ${result.storedCount} stored, ${result.skippedCount} skipped.`,
      "NewsWorker"
    );
    return result;
  }

  async run(signal: AbortSignal): Promise<void> {
    const initial = await this.schedule.collectOnSchedule();
    this.logger.log(
      `News worker initial collection is ${initial.status}: ${initial.storedCount} stored, ${initial.skippedCount} skipped.`,
      "NewsWorker"
    );
    this.schedule.start();
    try {
      await waitForAbort(signal);
    } finally {
      this.schedule.stop();
      this.logger.log("News worker stopped gracefully.", "NewsWorker");
    }
  }
}
