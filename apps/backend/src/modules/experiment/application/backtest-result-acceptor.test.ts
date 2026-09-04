// Runtime provenance verification tests at the result-acceptance boundary.

import { describe, expect, it, vi } from "vitest";
import type { BacktestRunnerOutcome } from "./backtest-runner-service.js";
import { DurableBacktestResultAcceptor } from "./backtest-result-acceptor.js";
import type { SentimentUsageManifest } from "./sentiment-usage-manifest.js";

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

  it("records a supplied multi-window sentiment usage manifest in the provenance checklist", async () => {
    const sentimentUsage: SentimentUsageManifest = {
      schemaVersion: "sentiment-feature-usage.v1",
      snapshots: [
        {
          window: { id: "window-first", startAt: 1_000, endAt: 61_000, aggregationVersion: "signed-mean-v1" },
          resultIds: ["result-a"],
          modelVersions: ["model-v1"],
          freshness: { state: "current", ageMs: 0 },
          quality: "current",
          appliedPolicy: { state: "not-applied" }
        },
        {
          window: { id: "window-second", startAt: 61_000, endAt: 121_000, aggregationVersion: "signed-mean-v1" },
          resultIds: ["result-b", "result-c"],
          modelVersions: ["model-v2", "model-v1"],
          freshness: { state: "stale", ageMs: 60_000 },
          quality: "degraded",
          appliedPolicy: { state: "applied", reason: "stale", action: "degrade" }
        }
      ]
    };
    const withSentiment = {
      ...outcome,
      specification: {
        ...outcome.specification,
        content: {
          ...outcome.specification.content,
          sentimentInput: {
            windowDurationMs: 60_000,
            policy: {
              maxAgeMs: 30_000,
              onMissing: { action: "substitute", substituteValue: 0 },
              onStale: { action: "degrade" }
            }
          }
        }
      },
      sentimentUsage
    } as unknown as BacktestRunnerOutcome;
    const store = { accept: vi.fn(async () => ({ resultId: "result" })) };

    await new DurableBacktestResultAcceptor(store as never).accept(withSentiment);

    expect(store.accept).toHaveBeenCalledWith(
      withSentiment,
      expect.objectContaining({
        newsInput: { status: "recorded", value: sentimentUsage },
        sentimentModel: { status: "recorded", value: ["model-v1", "model-v2"] }
      })
    );
  });

  it("rejects a sentiment-dependent frozen specification without durable sentiment usage", () => {
    const requiresSentiment = {
      ...outcome,
      specification: {
        ...outcome.specification,
        content: {
          ...outcome.specification.content,
          sentimentInput: {
            windowDurationMs: 60_000,
            policy: {
              maxAgeMs: 30_000,
              onMissing: { action: "substitute", substituteValue: 0 },
              onStale: { action: "degrade" }
            }
          }
        }
      }
    } as BacktestRunnerOutcome;

    expect(() => new DurableBacktestResultAcceptor({ accept: vi.fn(async () => ({ resultId: "result" })) } as never)
      .accept(requiresSentiment))
      .toThrow("BACKTEST_SENTIMENT_PROVENANCE_REQUIRED");
  });

  it("rejects sentiment usage for a technical-only frozen specification", () => {
    const technicalWithSentiment = {
      ...outcome,
      sentimentUsage: { schemaVersion: "sentiment-feature-usage.v1", snapshots: [] }
    } as BacktestRunnerOutcome;

    expect(() => new DurableBacktestResultAcceptor({ accept: vi.fn(async () => ({ resultId: "result" })) } as never)
      .accept(technicalWithSentiment))
      .toThrow("BACKTEST_SENTIMENT_PROVENANCE_FORBIDDEN");
  });
});
