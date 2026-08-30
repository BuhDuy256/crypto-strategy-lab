// Runtime provenance verification tests at the result-acceptance boundary.

import { describe, expect, it, vi } from "vitest";
import type { BacktestRunnerOutcome } from "./backtest-runner-service.js";
import { DurableBacktestResultAcceptor } from "./backtest-result-acceptor.js";

const identity = {
  nodeRuntimeVersion: "22.0.0", dependencyLockHash: "a".repeat(64),
  applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
};

const outcome = {
  runtimeIdentity: identity,
  specification: {
    specId: "spec", contentHash: "b".repeat(64),
    content: {
      provenance: { ...identity, engine: { id: "backtester", version: "1.0.0" } },
      datasetRef: {}, strategy: {}, execution: {},
      metricSet: { id: "mvp-metrics", version: "1.0.0" }
    }
  },
  evaluation: { metricSet: { id: "mvp-metrics", version: "1.0.0" } },
  claim: { attempt: 1, runnerId: "runner" },
  datasetManifest: { gaps: [] }
} as unknown as BacktestRunnerOutcome;

describe("DurableBacktestResultAcceptor", () => {
  it("accepts runtime identity that matches the frozen specification", async () => {
    const store = { accept: vi.fn(async () => ({ resultId: "result" })) };
    await new DurableBacktestResultAcceptor(store as never).accept(outcome);
    expect(store.accept).toHaveBeenCalledOnce();
  });

  it("rejects a producing runtime that differs from frozen provenance", async () => {
    const changed = { ...outcome, runtimeIdentity: { ...identity, workerCommit: "other" } };
    expect(() => new DurableBacktestResultAcceptor({ accept: vi.fn() } as never).accept(changed))
      .toThrow("BACKTEST_PROVENANCE_MISMATCH: workerCommit");
  });

  it("rejects a frozen engine identity that differs from the executed engine", () => {
    const changed = {
      ...outcome,
      specification: {
        ...outcome.specification,
        content: {
          ...outcome.specification.content,
          provenance: {
            ...outcome.specification.content.provenance,
            engine: { id: "another-engine", version: "9.0.0" }
          }
        }
      }
    } as BacktestRunnerOutcome;
    expect(() => new DurableBacktestResultAcceptor({ accept: vi.fn() } as never).accept(changed))
      .toThrow("BACKTEST_PROVENANCE_MISMATCH: engine");
  });

  const projectable = {
    ...outcome,
    job: { runId: "run-1" },
    claim: { attempt: 3, runnerId: "runner" },
    evaluation: { metricSet: { id: "mvp-metrics", version: "1.0.0" }, values: { totalReturn: 0.2 } }
  } as unknown as BacktestRunnerOutcome;

  it("hands the accepted result to the leaderboard projection", async () => {
    const store = { accept: vi.fn(async () => ({ resultId: "result-1", runId: "run-1" })) };
    const projection = { apply: vi.fn(async () => ({ applied: false, reason: "unchanged" })) };
    await new DurableBacktestResultAcceptor(store as never, projection).accept(projectable);
    expect(projection.apply).toHaveBeenCalledWith({
      resultId: "result-1",
      runId: "run-1",
      aggregateVersion: 3,
      metrics: { totalReturn: 0.2 }
    });
  });

  it("keeps an accepted result even when the projection fails", async () => {
    const store = { accept: vi.fn(async () => ({ resultId: "result-1", runId: "run-1" })) };
    const projection = { apply: vi.fn(async () => { throw new Error("projection down"); }) };
    const logger = { error: vi.fn() };
    await expect(
      new DurableBacktestResultAcceptor(store as never, projection, logger).accept(projectable)
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
