// Provider health transitions. No provider connection and no database here:
// this file only proves what the tracker decides and what it writes.

import { describe, expect, it } from "vitest";
import {
  ProviderHealthTracker,
  type ProviderHealthRecord,
  type ProviderHealthStore
} from "./provider-health.js";

class RecordingStore implements ProviderHealthStore {
  readonly records: ProviderHealthRecord[] = [];

  async record(state: ProviderHealthRecord): Promise<void> {
    this.records.push(state);
  }
}

class FailingStore implements ProviderHealthStore {
  async record(): Promise<void> {
    throw new Error("provider_health is unreachable");
  }
}

function silentLogger(): { log: () => void; warn: (message: string) => void; warnings: string[] } {
  const warnings: string[] = [];
  return {
    log: (): void => undefined,
    warn: (message: string): void => {
      warnings.push(message);
    },
    warnings
  };
}

describe("ProviderHealthTracker", () => {
  it("records degraded and returns to healthy on the next live candle", async () => {
    const store = new RecordingStore();
    let clock = 1000;
    const tracker = new ProviderHealthTracker("binance", store, silentLogger(), () => clock);

    tracker.onLiveCandle();
    clock = 2000;
    tracker.markDegraded("the provider closed the stream");
    clock = 3000;
    tracker.onLiveCandle();
    await tracker.settle();

    expect(store.records.map((entry) => entry.status)).toStrictEqual([
      "healthy",
      "degraded",
      "healthy"
    ]);
    expect(store.records[1]).toStrictEqual<ProviderHealthRecord>({
      provider: "binance",
      status: "degraded",
      reason: "the provider closed the stream",
      checkedAt: 2000
    });
    expect(tracker.status).toBe("healthy");
  });

  it("writes once per transition, not once per candle", async () => {
    const store = new RecordingStore();
    const tracker = new ProviderHealthTracker("binance", store, silentLogger());

    for (let tick = 0; tick < 50; tick += 1) tracker.onLiveCandle();
    await tracker.settle();

    expect(store.records).toHaveLength(1);
  });

  it("treats a changed reason at the same status as a new transition", async () => {
    const store = new RecordingStore();
    const tracker = new ProviderHealthTracker("binance", store, silentLogger());

    tracker.markDegraded("the provider closed the stream");
    tracker.markDegraded("the provider closed the stream");
    tracker.markDegraded("recovering missing candles");
    await tracker.settle();

    expect(store.records.map((entry) => entry.reason)).toStrictEqual([
      "the provider closed the stream",
      "recovering missing candles"
    ]);
  });

  it("keeps the candle path alive when the health write fails", async () => {
    const logger = silentLogger();
    const tracker = new ProviderHealthTracker("binance", new FailingStore(), logger);

    expect(() => tracker.markDegraded("the provider closed the stream")).not.toThrow();
    await expect(tracker.settle()).resolves.toBeUndefined();
    expect(logger.warnings.some((entry) => entry.includes("unreachable"))).toBe(true);
  });
});
