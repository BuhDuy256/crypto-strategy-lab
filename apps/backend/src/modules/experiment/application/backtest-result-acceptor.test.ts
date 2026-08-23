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
});
