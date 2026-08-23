// Application tests for durable-before-dispatch and logical idempotency.

import { describe, expect, it, vi } from "vitest";
import type { ExperimentSpecificationService } from "./experiment-specification-service.js";
import { BacktestRunService, type BacktestExecutor, type BacktestRunStore } from "./backtest-run-service.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";

const frozen = {
  specId: "10000000-0000-4000-8000-000000000001", status: "frozen", contentHash: "a".repeat(64),
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", frozenAt: "2026-01-01T00:00:00.000Z",
  content: {
    schemaVersion: "v1", datasetRef: {},
    strategy: { id: "ma", version: "1.0.0", parameters: { period: 10 } }, execution: {}, metricSet: {},
    provenance: { engine: { id: "backtester", version: "1.0.0" }, deterministicConfigVersion: "1.0.0", workerCommit: "abc" }
  }
} as unknown as FrozenExperimentSpecification;

describe("BacktestRunService", () => {
  it("persists before enqueue and reuses a duplicate without enqueueing again", async () => {
    const order: string[] = [];
    let existing: Awaited<ReturnType<BacktestRunStore["find"]>>;
    const store: BacktestRunStore = {
      async createOrGet(input) {
        if (existing !== undefined) return { run: existing, created: false };
        order.push("commit");
        existing = { ...input, status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
        return { run: existing, created: true };
      }, async find() { return existing; }
    };
    const executor: BacktestExecutor = { enqueue: vi.fn(async () => { order.push("enqueue"); }) };
    const specifications = { get: vi.fn(async () => frozen) } as unknown as ExperimentSpecificationService;
    const service = new BacktestRunService(specifications, store, executor);
    const first = await service.start(frozen.specId, "request-1");
    const second = await service.start(frozen.specId, "request-2");

    expect(order).toEqual(["commit", "enqueue"]);
    expect(second.runId).toBe(first.runId);
    expect(executor.enqueue).toHaveBeenCalledTimes(1);
    expect(first.candidateId).toMatch(/^[0-9a-f]{64}$/);
    expect(first.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
