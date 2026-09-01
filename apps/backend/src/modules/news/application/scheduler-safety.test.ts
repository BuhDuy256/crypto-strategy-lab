// Regression coverage for timer-owned News work: failure containment, serialization, and shutdown.

import { describe, expect, it, vi } from "vitest";
import { NewsCollectionScheduler, type NewsCollectionTimer } from "./news-collection-service.js";
import { SentimentAnalysisScheduler, type SentimentAnalysisTimer } from "./sentiment-analysis-service.js";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface SchedulerHarness {
  readonly start: () => void;
  readonly stop: () => void;
  readonly tick: () => void;
  readonly clearInterval: ReturnType<typeof vi.fn>;
  readonly logger: { readonly error: ReturnType<typeof vi.fn> };
}

interface SchedulerCase {
  readonly name: string;
  readonly error: string;
  readonly context: string;
  readonly create: (run: () => Promise<unknown>) => SchedulerHarness;
}

function collectionHarness(run: () => Promise<unknown>): SchedulerHarness {
  let callback: (() => void) | undefined;
  const clearInterval = vi.fn();
  const timer: NewsCollectionTimer = {
    setInterval: (next) => {
      callback = next;
      return "collection-timer";
    },
    clearInterval
  };
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const scheduler = new NewsCollectionScheduler({ collectNow: run } as never, 10, timer, logger);
  return { start: () => scheduler.start(), stop: () => scheduler.stop(), tick: () => callback?.(), clearInterval, logger };
}

function analysisHarness(run: () => Promise<unknown>): SchedulerHarness {
  let callback: (() => void) | undefined;
  const clearInterval = vi.fn();
  const timer: SentimentAnalysisTimer = {
    setInterval: (next) => {
      callback = next;
      return "analysis-timer";
    },
    clearInterval
  };
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const scheduler = new SentimentAnalysisScheduler({ analyzeNextBatch: run } as never, 10, timer, logger);
  return { start: () => scheduler.start(), stop: () => scheduler.stop(), tick: () => callback?.(), clearInterval, logger };
}

const schedulerCases: readonly SchedulerCase[] = [
  { name: "News collection", error: "store unavailable", context: "NewsCollection", create: collectionHarness },
  { name: "Sentiment analysis", error: "database unavailable", context: "SentimentAnalysis", create: analysisHarness }
];

describe.each(schedulerCases)("$name scheduler safety", ({ error, context, create }) => {
  it("does not overlap an active scheduled run", async () => {
    const first = deferred<unknown>();
    const run = vi.fn(() => first.promise);
    const scheduler = create(run);

    scheduler.start();
    scheduler.tick();
    scheduler.tick();
    expect(run).toHaveBeenCalledOnce();

    first.resolve(undefined);
    await settle();
  });

  it("contains a scheduled rejection and reports it", async () => {
    const first = deferred<unknown>();
    const run = vi.fn(() => first.promise);
    const scheduler = create(run);

    scheduler.start();
    scheduler.tick();
    first.reject(new Error(error));
    await settle();

    expect(scheduler.logger.error).toHaveBeenCalledWith(expect.stringContaining(error), context);
  });

  it("runs the next scheduled tick after a rejected run", async () => {
    const first = deferred<unknown>();
    const run = vi.fn(() => first.promise);
    const scheduler = create(run);

    scheduler.start();
    scheduler.tick();
    first.reject(new Error(error));
    await settle();
    run.mockResolvedValueOnce(undefined);

    scheduler.tick();
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not start work from a retained callback after stop", async () => {
    const run = vi.fn(() => Promise.resolve(undefined));
    const scheduler = create(run);

    scheduler.start();
    scheduler.stop();
    scheduler.tick();
    await settle();
    expect(scheduler.clearInterval).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });
});
