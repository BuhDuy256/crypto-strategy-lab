// Runner orchestration tests through durable input and result-acceptance ports.

import { describe, expect, it, vi } from "vitest";
import type { DatasetService } from "../../market/index.js";
import { StrategyRegistry, type Strategy, type StrategyResult } from "../../strategy/index.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";
import type { ClaimedBacktestJob } from "./backtest-run-service.js";
import {
  BacktestRunnerService,
  type BacktestResultAcceptor,
  type BacktestWorkQueue
} from "./backtest-runner-service.js";
import { InlineBacktestComputation } from "./backtest-computation.js";

const bars = [
  { provider: "binance", symbol: "BTCUSDT", timeframe: "1h" as const, openTime: 0,
    closeTime: 9, open: 100, high: 101, low: 99, close: 100, volume: 1,
    closed: true as const, revision: 1 },
  { provider: "binance", symbol: "BTCUSDT", timeframe: "1h" as const, openTime: 10,
    closeTime: 19, open: 100, high: 111, low: 99, close: 110, volume: 1,
    closed: true as const, revision: 1 }
];

const specification = {
  specId: "10000000-0000-4000-8000-000000000001",
  status: "frozen",
  contentHash: "a".repeat(64),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  frozenAt: "2026-01-01T00:00:00.000Z",
  content: {
    schemaVersion: "v1", datasetRef: { datasetId: "dataset" },
    strategy: { id: "test", version: "1.0.0", parameters: {} },
    execution: {
      initialCapital: 1000, feeRate: 0, slippageRate: 0,
      signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
      leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
      stopLoss: { enabled: false }, takeProfit: { enabled: false },
      sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close",
      decimalPlaces: 8
    },
    metricSet: { id: "mvp-metrics", version: "1.0.0" },
    provenance: { engine: { id: "backtester", version: "1.0.0" } }
  }
} as unknown as FrozenExperimentSpecification;

const claim = {
  run: { runId: "20000000-0000-4000-8000-000000000001" },
  job: {
    jobId: "20000000-0000-4000-8000-000000000001",
    runId: "20000000-0000-4000-8000-000000000001",
    specId: specification.specId,
    candidateId: "candidate", attempt: 1, idempotencyKey: "b".repeat(64),
    correlationId: "request-1"
  },
  attempt: 1,
  leaseExpiresAt: "2026-01-01T00:00:30.000Z",
  runnerId: "runner-1"
} as ClaimedBacktestJob;

class TestStrategy implements Strategy {
  readonly descriptor = {
    id: "test", version: "1.0.0", name: "Test", description: "Runner fixture",
    category: "trend" as const, capabilities: ["long"] as const,
    parameterSchema: { properties: {}, required: [] }, requiredInputs: ["price-bars"] as const,
    implementation: { kind: "built-in" as const, key: "test" }
  };
  evaluate(context: { evaluationTime: number }): StrategyResult {
    return {
      signal: { action: context.evaluationTime === 9 ? "buy" : "hold", effectiveTime: context.evaluationTime },
      annotations: [{ type: "marker", id: `signal-${context.evaluationTime}`, label: "Signal",
        time: context.evaluationTime, direction: "up" }]
    };
  }
}

describe("BacktestRunnerService", () => {
  it("resolves durable inputs and accepts trades, annotations, and metrics", async () => {
    const queue: BacktestWorkQueue = {
      claimNext: vi.fn(async () => claim), heartbeat: vi.fn(async () => true),
      isCancellationRequested: vi.fn(async () => false), fail: vi.fn(), release: vi.fn()
    };
    const acceptor: BacktestResultAcceptor = { accept: vi.fn(async () => undefined) };
    const datasets = { resolveDataset: vi.fn(async () => ({ manifest: {}, candles: bars })) } as unknown as DatasetService;
    const service = new BacktestRunnerService(
      queue,
      { get: vi.fn(async () => specification) },
      datasets,
      new InlineBacktestComputation(new StrategyRegistry([new TestStrategy()])),
      acceptor,
      {
        nodeRuntimeVersion: "22.0.0", dependencyLockHash: "c".repeat(64),
        applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
      }
    );

    expect(await service.processNext("runner-1")).toBe(true);
    expect(acceptor.accept).toHaveBeenCalledWith(expect.objectContaining({
      job: claim.job,
      claim,
      simulation: expect.objectContaining({ trades: [expect.objectContaining({ direction: "long" })] }),
      evaluation: expect.objectContaining({ values: expect.objectContaining({ numberOfTrades: 1 }) })
    }));
  });

  it("fails an unrecoverable run without accepting a partial result", async () => {
    const queue: BacktestWorkQueue = {
      claimNext: vi.fn(async () => claim), heartbeat: vi.fn(async () => true),
      isCancellationRequested: vi.fn(async () => false), fail: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined)
    };
    const acceptor: BacktestResultAcceptor = { accept: vi.fn() };
    const service = new BacktestRunnerService(
      queue,
      { get: vi.fn(async () => { throw new Error("broken input"); }) },
      {} as DatasetService,
      new InlineBacktestComputation(new StrategyRegistry()),
      acceptor,
      {
        nodeRuntimeVersion: "22.0.0", dependencyLockHash: "c".repeat(64),
        applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
      }
    );

    await expect(service.processNext("runner-1")).resolves.toBe(true);
    expect(queue.fail).toHaveBeenCalledWith(claim, "BACKTEST_INPUT_RESOLUTION_FAILED");
    expect(acceptor.accept).not.toHaveBeenCalled();
  });

  it("releases an active claim when graceful shutdown is requested", async () => {
    const queue: BacktestWorkQueue = {
      claimNext: vi.fn(async () => claim), heartbeat: vi.fn(async () => true),
      isCancellationRequested: vi.fn(async () => false), fail: vi.fn(),
      release: vi.fn(async () => undefined)
    };
    const controller = new AbortController();
    controller.abort();
    const service = new BacktestRunnerService(
      queue,
      { get: vi.fn() },
      {} as DatasetService,
      new InlineBacktestComputation(new StrategyRegistry()),
      { accept: vi.fn() },
      {
        nodeRuntimeVersion: "22.0.0", dependencyLockHash: "c".repeat(64),
        applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
      }
    );
    await service.processNext("runner-1", controller.signal);
    expect(queue.release).toHaveBeenCalledWith(claim);
  });

  it("stops before acceptance after losing claim ownership", async () => {
    const queue: BacktestWorkQueue = {
      claimNext: vi.fn(async () => claim), heartbeat: vi.fn(async () => false),
      isCancellationRequested: vi.fn(), fail: vi.fn(), release: vi.fn()
    };
    const acceptor = { accept: vi.fn() };
    const service = new BacktestRunnerService(
      queue, { get: vi.fn() }, {} as DatasetService,
      new InlineBacktestComputation(new StrategyRegistry()), acceptor,
      {
        nodeRuntimeVersion: "22.0.0", dependencyLockHash: "c".repeat(64),
        applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
      }
    );
    await service.processNext("runner-1");
    expect(acceptor.accept).not.toHaveBeenCalled();
    expect(queue.fail).not.toHaveBeenCalled();
  });

  it("aborts CPU computation when a heartbeat request fails", async () => {
      const queue: BacktestWorkQueue = {
        claimNext: vi.fn(async () => claim),
        heartbeat: vi.fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(true)
          .mockRejectedValueOnce(new Error("database unavailable")),
        isCancellationRequested: vi.fn(async () => false), fail: vi.fn(), release: vi.fn()
      };
      let computationSignal: AbortSignal | undefined;
      let markComputationStarted: (() => void) | undefined;
      const computationStarted = new Promise<void>((resolve) => { markComputationStarted = resolve; });
      const computation = {
        compute: vi.fn(async (_input: unknown, signal?: AbortSignal) => {
          computationSignal = signal;
          markComputationStarted?.();
          await new Promise<void>((_resolve, reject) => signal?.addEventListener(
            "abort", () => reject(new Error("aborted")), { once: true }
          ));
          throw new Error("unreachable");
        })
      };
      const service = new BacktestRunnerService(
        queue, { get: vi.fn(async () => specification) },
        { resolveDataset: vi.fn(async () => ({ manifest: {}, candles: bars })) } as unknown as DatasetService,
        computation, { accept: vi.fn() },
        {
          nodeRuntimeVersion: "22.0.0", dependencyLockHash: "c".repeat(64),
          applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
        }, undefined, 1
      );
      const processing = service.processNext("runner-1");
      await computationStarted;
      await processing;
      expect(computationSignal?.aborted).toBe(true);
      expect(queue.fail).not.toHaveBeenCalled();
  });
});
