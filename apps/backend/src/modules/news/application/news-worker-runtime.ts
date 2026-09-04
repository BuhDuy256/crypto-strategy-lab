// Process-lifetime wrapper for the isolated News collection worker.

import type { NewsCollectionResult } from "./news-collection-service.js";
import type { SentimentAnalysisRunResult } from "./sentiment-analysis-service.js";
import type { NewsWorkerHeartbeat } from "./news-worker-heartbeat.js";

export interface NewsWorkerSchedule {
  collectManually(): Promise<NewsCollectionResult>;
  collectOnSchedule(): Promise<NewsCollectionResult>;
  start(): void;
  stop(): void;
}

export interface NewsWorkerAnalysisSchedule {
  analyzeManually(): Promise<SentimentAnalysisRunResult>;
  analyzeOnSchedule(): Promise<SentimentAnalysisRunResult>;
  start(): void;
  stop(): void;
}

/** Releases inference-owned resources before the worker's shared pool shuts down. */
export interface NewsWorkerAnalysisLifecycle {
  close(): Promise<void>;
}

export interface NewsWorkerLogger {
  log(message: string, context?: string): void;
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

/**
 * Runs the two independent News stages in one process; API, market ingest, and
 * backtesting have separate roles. The stages never call each other: this runtime
 * starts both, and they meet only in durable state.
 */
export class NewsWorkerRuntime {
  constructor(
    private readonly schedule: NewsWorkerSchedule,
    private readonly analysis: NewsWorkerAnalysisSchedule,
    private readonly heartbeat: NewsWorkerHeartbeat,
    private readonly analysisLifecycle: NewsWorkerAnalysisLifecycle,
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

  async analyzeOnce(): Promise<SentimentAnalysisRunResult> {
    const result = await this.analysis.analyzeManually();
    this.logger.log(
      `Manual sentiment analysis claimed ${result.claimedCount}, analyzed ${result.analyzedCount}, ` +
        `degraded ${result.degradedCount}.`,
      "NewsWorker"
    );
    return result;
  }

  async run(signal: AbortSignal): Promise<void> {
    await this.heartbeat.start();
    try {
      const initial = await this.schedule.collectOnSchedule();
      this.logger.log(
        `News worker initial collection is ${initial.status}: ${initial.storedCount} stored, ${initial.skippedCount} skipped.`,
        "NewsWorker"
      );
      const analyzed = await this.analysis.analyzeOnSchedule();
      this.logger.log(
        `News worker initial analysis claimed ${analyzed.claimedCount}, analyzed ${analyzed.analyzedCount}, ` +
          `degraded ${analyzed.degradedCount}.`,
        "NewsWorker"
      );
      this.schedule.start();
      this.analysis.start();
      await waitForAbort(signal);
    } finally {
      this.schedule.stop();
      this.analysis.stop();
      this.heartbeat.stop();
      try {
        await this.analysisLifecycle.close();
      } finally {
        this.logger.log("News worker stopped gracefully.", "NewsWorker");
      }
    }
  }
}
