// Unit tests for assembling and freezing a search experiment.
//
// The service turns a high-level search request into a complete frozen
// specification: it resolves a real dataset, fills the fixed V1 parts (execution
// profile, metric set, ranking policy), carries the search configuration, and
// freezes with the runtime provenance the backtest runner requires. The fakes
// here stand in for the dataset and specification ports so the assembly logic is
// tested without a database.

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
import {
  SearchExperimentCreationService,
  type CreateSearchExperimentInput,
  type SearchExperimentDatasets,
  type SearchExperimentSpecifications
} from "./search-experiment-creation-service.js";

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
    range: { startTime: 1_704_067_200_000, endTime: 1_704_153_600_000 },
    revisionWatermark: 3,
    integrityHash: "c".repeat(64)
  },
  candleCount: 24,
  gaps: []
};

const strategies = createBuiltInStrategyRegistry();
const firstStrategy = strategies.list()[0]!;

function input(overrides: Partial<CreateSearchExperimentInput> = {}): CreateSearchExperimentInput {
  return {
    dataset: {
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: { startTime: 1_704_067_200_000, endTime: 1_704_153_600_000 }
    },
    generator: { id: "random-search", version: "1.0.0", configuration: { maxConsecutiveDuplicates: 50 } },
    searchSpace: {
      strategies: [{ id: firstStrategy.id, version: firstStrategy.version }],
      compositeSizes: [1],
      policies: []
    },
    seed: "seed-1",
    stopConditions: { maxCandidates: 20 },
    maxInFlight: 2,
    ...overrides
  };
}

function fakes(): {
  readonly datasets: SearchExperimentDatasets;
  readonly specifications: SearchExperimentSpecifications;
  readonly created: { content?: ExperimentDraftContent; frozenWith?: FreezeProvenance };
} {
  const created: { content?: ExperimentDraftContent; frozenWith?: FreezeProvenance } = {};
  const datasets: SearchExperimentDatasets = {
    createDataset: vi.fn(() => Promise.resolve(manifest))
  };
  const specifications: SearchExperimentSpecifications = {
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
      return Promise.resolve({
        specId,
        status: "frozen",
        content: { ...(created.content as ExperimentDraftContent), provenance: prov },
        contentHash: "hash",
        frozenAt: "t",
        createdAt: "t",
        updatedAt: "t"
      } as FrozenExperimentSpecification);
    }
  };
  return { datasets, specifications, created };
}

describe("SearchExperimentCreationService", () => {
  it("resolves a real dataset for the requested window", async () => {
    const { datasets, specifications } = fakes();
    const service = new SearchExperimentCreationService(datasets, specifications, strategies, provenance);
    await service.create(input());
    expect(datasets.createDataset).toHaveBeenCalledWith({
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      range: { startTime: 1_704_067_200_000, endTime: 1_704_153_600_000 }
    });
  });

  it("carries the search configuration the caller supplied", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SearchExperimentCreationService(datasets, specifications, strategies, provenance);
    await service.create(input());
    const search = created.content?.search;
    expect(search).toBeDefined();
    expect(search?.generator).toEqual({ id: "random-search", version: "1.0.0" });
    expect(search?.generatorConfiguration).toEqual({ maxConsecutiveDuplicates: 50 });
    expect(search?.searchSpace).toEqual({
      strategies: [{ id: firstStrategy.id, version: firstStrategy.version }],
      compositeSizes: [1],
      policies: []
    });
    expect(search?.seed).toBe("seed-1");
    expect(search?.stopConditions).toEqual({ maxCandidates: 20 });
    expect(search?.maxInFlight).toBe(2);
  });

  it("supplies the fixed V1 ranking policy and metric set", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SearchExperimentCreationService(datasets, specifications, strategies, provenance);
    await service.create(input());
    expect(created.content?.metricSet).toEqual(MVP_METRIC_SET);
    expect(created.content?.search?.rankingPolicy).toEqual({
      id: "weighted-return-drawdown",
      version: "1.0.0"
    });
    expect(created.content?.search?.rankingConfiguration).toEqual({
      weights: { totalReturn: 1, maximumDrawdown: -1 },
      minTrades: 5
    });
  });

  it("uses the first allowed strategy as a valid base template", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SearchExperimentCreationService(datasets, specifications, strategies, provenance);
    await service.create(input());
    const base = created.content?.strategy;
    expect(base?.id).toBe(firstStrategy.id);
    expect(base?.version).toBe(firstStrategy.version);
    // The template must pass the strategy's own validation, since freeze enforces it.
    expect(() =>
      strategies.resolve({ id: base!.id, version: base!.version }).validateParameters(base!.parameters)
    ).not.toThrow();
  });

  it("freezes with the injected runtime provenance and returns the spec id", async () => {
    const { datasets, specifications, created } = fakes();
    const service = new SearchExperimentCreationService(datasets, specifications, strategies, provenance);
    const result = await service.create(input());
    expect(result).toEqual({ specId: "spec-1" });
    expect(created.frozenWith).toEqual(provenance);
  });

  it("rejects a search space with no strategies", async () => {
    const { datasets, specifications } = fakes();
    const service = new SearchExperimentCreationService(datasets, specifications, strategies, provenance);
    await expect(
      service.create(input({ searchSpace: { strategies: [], compositeSizes: [1], policies: [] } }))
    ).rejects.toThrow("SEARCH_EXPERIMENT_NO_STRATEGY");
  });

  it("rejects a run with no stop condition", async () => {
    const { datasets, specifications } = fakes();
    const service = new SearchExperimentCreationService(datasets, specifications, strategies, provenance);
    await expect(service.create(input({ stopConditions: {} }))).rejects.toThrow(
      "SEARCH_EXPERIMENT_NO_STOP_CONDITION"
    );
  });
});
