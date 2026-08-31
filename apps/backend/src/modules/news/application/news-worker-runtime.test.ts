// Focused runtime and topology checks for the isolated News worker process role.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NewsWorkerRuntime,
  type NewsWorkerAnalysisSchedule,
  type NewsWorkerSchedule
} from "./news-worker-runtime.js";
import type { NewsWorkerHeartbeat } from "./news-worker-heartbeat.js";

class RecordingSchedule implements NewsWorkerSchedule {
  readonly calls: string[] = [];

  async collectManually() {
    this.calls.push("manual");
    return { status: "healthy" as const, provider: "coindesk-rss", fetchedCount: 1, storedCount: 1, skippedCount: 0 };
  }

  async collectOnSchedule() {
    this.calls.push("scheduled");
    return { status: "healthy" as const, provider: "coindesk-rss", fetchedCount: 1, storedCount: 1, skippedCount: 0 };
  }

  start(): void { this.calls.push("start"); }
  stop(): void { this.calls.push("stop"); }
}

class RecordingAnalysisSchedule implements NewsWorkerAnalysisSchedule {
  readonly calls: string[] = [];

  async analyzeManually() {
    this.calls.push("manual");
    return {
      analyzerId: "fake-analyzer",
      claimedCount: 1,
      analyzedCount: 1,
      retryableFailureCount: 0,
      degradedCount: 0,
      lostClaimCount: 0
    };
  }

  async analyzeOnSchedule() {
    this.calls.push("scheduled");
    return {
      analyzerId: "fake-analyzer",
      claimedCount: 1,
      analyzedCount: 1,
      retryableFailureCount: 0,
      degradedCount: 0,
      lostClaimCount: 0
    };
  }

  start(): void { this.calls.push("start"); }
  stop(): void { this.calls.push("stop"); }
}

class RecordingHeartbeat implements NewsWorkerHeartbeat {
  readonly calls: string[] = [];

  async start(): Promise<void> { this.calls.push("start"); }
  stop(): void { this.calls.push("stop"); }
}

describe("NewsWorkerRuntime", () => {
  it("runs independent collection and analyzer stages without a backtest runner", async () => {
    const schedule = new RecordingSchedule();
    const analysis = new RecordingAnalysisSchedule();
    const heartbeat = new RecordingHeartbeat();
    const runtime = new NewsWorkerRuntime(schedule, analysis, heartbeat, { log: () => undefined });
    const controller = new AbortController();
    const running = runtime.run(controller.signal);

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await running;

    expect(schedule.calls).toEqual(["scheduled", "start", "stop"]);
    expect(analysis.calls).toEqual(["scheduled", "start", "stop"]);
    expect(heartbeat.calls).toEqual(["start", "stop"]);
  });

  it("keeps manual collection and analysis as separate operational triggers", async () => {
    const schedule = new RecordingSchedule();
    const analysis = new RecordingAnalysisSchedule();
    const heartbeat = new RecordingHeartbeat();
    const runtime = new NewsWorkerRuntime(schedule, analysis, heartbeat, { log: () => undefined });

    await expect(runtime.collectOnce()).resolves.toMatchObject({ storedCount: 1 });
    await expect(runtime.analyzeOnce()).resolves.toMatchObject({ analyzedCount: 1 });
    expect(schedule.calls).toEqual(["manual"]);
    expect(analysis.calls).toEqual(["manual"]);
    expect(heartbeat.calls).toEqual([]);
  });
});

describe("News worker topology", () => {
  it("loads no API, market, or experiment module and leaves collection out of the API process", () => {
    const workerModule = readFileSync(new URL("../news-worker.module.ts", import.meta.url), "utf8");
    const workerEntry = readFileSync(new URL("../../../main.news-worker.ts", import.meta.url), "utf8");
    const apiEntry = readFileSync(new URL("../../../main.api.ts", import.meta.url), "utf8");
    const apiModule = readFileSync(new URL("../../api/api.module.ts", import.meta.url), "utf8");

    expect(workerModule).not.toMatch(/modules\/(?:api|market|experiment)|(?:Api|Market|Experiment)Module/u);
    expect(workerEntry).toContain("NewsWorkerModule");
    expect(workerEntry).not.toMatch(/(?:AppModule|MarketIngestModule|BacktestRunnerModule)/u);
    expect(`${apiEntry}\n${apiModule}`).not.toMatch(/(?:NewsWorkerModule|NewsCollectionService|NewsCollectionScheduler)/u);
  });

  it("defines independent Compose roles for news collection and the backtest runner", () => {
    const compose = readFileSync(new URL("../../../../../../docker-compose.yml", import.meta.url), "utf8");
    const newsWorkerStart = compose.indexOf("  news-worker:");
    const newsWorkerEnd = compose.indexOf("  web:", newsWorkerStart);
    const runnerStart = compose.indexOf("  runner:");
    const runnerEnd = compose.indexOf("  market-ingest:", runnerStart);
    const newsWorker = compose.slice(newsWorkerStart, newsWorkerEnd);
    const runner = compose.slice(runnerStart, runnerEnd);

    expect(newsWorker).toContain("start:news-worker");
    expect(runner).toContain("start:backtest-runner");
    expect(newsWorker).not.toContain("runner");
    expect(runner).not.toContain("news-worker");
  });
});
