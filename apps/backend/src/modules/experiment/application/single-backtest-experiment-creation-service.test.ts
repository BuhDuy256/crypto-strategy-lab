// Unit tests for assembling and freezing the specification of one single backtest.
//
// This is the path the Backtest page uses. It is the counterpart of
// SearchExperimentCreationService, so these tests cover the same three things:
// the dataset is resolved through the Market port rather than invented, the
// architecture-owned V1 parts are filled in by the server, and the specification
// is frozen with the real runtime provenance a result must match to be accepted.
//
// The last test compares this path against the search path directly, because the
// V1 execution profile is written out in both services. Two entry points that
// disagree there would produce specifications nobody can compare.

import { describe, expect, it, vi } from "vitest";
import { createBuiltInStrategyRegistry } from "../../strategy/index.js";
import type { DatasetManifest } from "../../market/index.js";
import { MVP_METRIC_SET } from "../domain/evaluator.js";
import type {
  DraftExperimentSpecification,
  ExperimentDraftContent,
  FreezeProvenance,
  FrozenExperimentSpecification
} from "../domain/experiment-specification.js";
import { SearchExperimentCreationService } from "./search-experiment-creation-service.js";
import {
  SingleBacktestExperimentCreationService,
  type CreateSingleBacktestExperimentInput,
  type SingleBacktestDatasets,
  type SingleBacktestSpecifications
} from "./single-backtest-experiment-creation-service.js";

const RANGE = { startTime: 1_704_067_200_000, endTime: 1_704_153_600_000 };

const provenance: FreezeProvenance = {
  engine: { id: "backtester", version: "1.0.0" },
  nodeRuntimeVersion: "22.0.0",
  dependencyLockHash: "a".repeat(64),
  applicationCommit: "app-commit",
  workerCommit: "worker-commit",
  deterministicConfigVersion: "1.0.0"
};

const manifest: DatasetManifest = {
  ref: {
    datasetId: "sha256:" + "c".repeat(64),
    version: 1,
    manifestVersion: "v1",
    provider: "binance",
    symbols: ["BTCUSDT"],
    timeframe: "1h",
    range: RANGE,
    revisionWatermark: 3,
    integrityHash: "c".repeat(64)
  },
  candleCount: 24,
  gaps: []
};

const strategies = createBuiltInStrategyRegistry();
const firstStrategy = strategies.resolve({
  id: "moving-average",
  version: "1.0.0"
}).descriptor;

function input(
  overrides: Partial<CreateSingleBacktestExperimentInput> = {}
): CreateSingleBacktestExperimentInput {
  return {
    dataset: { provider: "binance", symbol: "BTCUSDT", timeframe: "1h", range: RANGE },
    strategy: {
      id: firstStrategy.id,
      version: firstStrategy.version,
      parameters: { fastPeriod: 5, slowPeriod: 20, priceSource: "close" }
    },
    ...overrides
  };
}

function fakes(): {
  readonly datasets: SingleBacktestDatasets;
  readonly specifications: SingleBacktestSpecifications;
  readonly created: { content?: ExperimentDraftContent; frozenWith?: FreezeProvenance };
} {
  const created: { content?: ExperimentDraftContent; frozenWith?: FreezeProvenance } = {};
  const datasets: SingleBacktestDatasets = {
    createDataset: vi.fn(() => Promise.resolve(manifest))
  };
  const specifications: SingleBacktestSpecifications = {
    createDraft: (content) => {
      created.content = content;
      return Promise.resolve({
        specId: "spec-1",
        status: "draft",
        content,
        createdAt: "t",
        updatedAt: "t"
      } as DraftExperimentSpecification);
    },
    freeze: (specId, prov) => {
      created.frozenWith = prov;
      if (created.content === undefined) {
        throw new Error("test fake cannot freeze before draft creation");
      }
      return Promise.resolve({
        specId,
        status: "frozen",
        content: { ...created.content, provenance: prov },
        contentHash: "hash",
        frozenAt: "t",
        createdAt: "t",
        updatedAt: "t"
      } as FrozenExperimentSpecification);
    }
  };
  return { datasets, specifications, created };
}

describe("SingleBacktestExperimentCreationService", () => {
  it("resolves a real dataset for the requested window", async () => {
    const { datasets, specifications } = fakes();
    const service = new SingleBacktestExperimentCreationService(datasets, specifications, provenance);
    await service.create(input());
    expect(datasets.createDataset).toHaveBeenCalledWith({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: RANGE
    });
  });

  it("uses the manifest the Market module returned, never a reference of its own", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SingleBacktestExperimentCreationService(datasets, specifications, provenance);
    await service.create(input());
    expect(created.content?.datasetRef).toEqual(manifest.ref);
  });

  it("carries the strategy the caller chose", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SingleBacktestExperimentCreationService(datasets, specifications, provenance);
    await service.create(input());
    expect(created.content?.strategy).toEqual({
      id: firstStrategy.id,
      version: firstStrategy.version,
      parameters: { fastPeriod: 5, slowPeriod: 20, priceSource: "close" }
    });
  });

  it("freezes the explicit sentiment window and degradation policy for a sentiment candidate", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SingleBacktestExperimentCreationService(datasets, specifications, provenance);
    const sentimentInput = {
      windowDurationMs: 3_600_000,
      policy: {
        maxAgeMs: 300_000,
        onMissing: { action: "substitute" as const, substituteValue: 0 },
        onStale: { action: "degrade" as const }
      }
    };

    await service.create(input({
      strategy: {
        id: "news-sentiment",
        version: "1.0.0",
        parameters: {
          positiveThreshold: 0.2,
          negativeThreshold: -0.2,
          windowDurationMs: 3_600_000
        }
      },
      sentimentInput
    }));

    expect(created.content?.sentimentInput).toEqual(sentimentInput);
  });

  it("fills the architecture-owned V1 execution profile and metric set", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SingleBacktestExperimentCreationService(datasets, specifications, provenance);
    await service.create(input());
    expect(created.content?.metricSet).toEqual({
      id: MVP_METRIC_SET.id,
      version: MVP_METRIC_SET.version
    });
    expect(created.content?.execution.initialCapital).toBe(10_000);
    expect(created.content?.execution.fillRule).toBe("next-open");
    expect(created.content?.execution.signalTiming).toBe("close-of-bar");
    expect(created.content?.execution.maxConcurrentPositions).toBe(1);
  });

  it("adds no search block, because a single backtest is not a search", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SingleBacktestExperimentCreationService(datasets, specifications, provenance);
    await service.create(input());
    expect(created.content?.search).toBeUndefined();
  });

  // A result is only accepted when the frozen provenance matches the runner's
  // runtime identity. Freezing with anything else is the defect this service was
  // added to fix, so it is pinned here.
  it("freezes with the runtime provenance it was given", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SingleBacktestExperimentCreationService(datasets, specifications, provenance);
    const result = await service.create(input());
    expect(created.frozenWith).toEqual(provenance);
    expect(result.specId).toBe("spec-1");
  });

  it("assembles the same draft content for the same configuration", async () => {
    const first = fakes();
    const second = fakes();
    await new SingleBacktestExperimentCreationService(
      first.datasets, first.specifications, provenance
    ).create(input());
    await new SingleBacktestExperimentCreationService(
      second.datasets, second.specifications, provenance
    ).create(input());
    expect(first.created.content).toEqual(second.created.content);
  });

  // Guards the duplicated V1 execution profile. If either copy is edited alone,
  // the two entry points stop producing comparable specifications and this fails.
  it("produces the same execution profile and metric set as the search path", async () => {
    const single = fakes();
    await new SingleBacktestExperimentCreationService(
      single.datasets, single.specifications, provenance
    ).create(input());

    const search = fakes();
    await new SearchExperimentCreationService(
      search.datasets, search.specifications, strategies, provenance
    ).create({
      dataset: { provider: "binance", symbol: "BTCUSDT", timeframe: "1h", range: RANGE },
      generator: { id: "random-search", version: "1.0.0", configuration: {} },
      searchSpace: {
        strategies: [{ id: firstStrategy.id, version: firstStrategy.version }],
        compositeSizes: [1],
        policies: []
      },
      seed: "seed-1",
      stopConditions: { maxCandidates: 1 },
      maxInFlight: 1
    });

    expect(single.created.content?.execution).toEqual(search.created.content?.execution);
    expect(single.created.content?.metricSet).toEqual(search.created.content?.metricSet);
  });
});
