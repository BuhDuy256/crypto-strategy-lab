// In-memory tests for Experiment-owned sentiment configuration on frozen specifications.

import { describe, expect, it } from "vitest";
import type { DatasetRef, DatasetService } from "../../market/index.js";
import {
  CompositeStrategyService,
  StrategyRegistry,
  type CompositeStrategyDefinition,
  type Strategy,
  type StrategyResult
} from "../../strategy/index.js";
import type {
  DraftExperimentSpecification,
  ExperimentDraftContent,
  ExperimentSpecification,
  FreezeProvenance,
  FrozenExperimentContent,
  FrozenExperimentSpecification
} from "../domain/experiment-specification.js";
import {
  ExperimentSpecificationService,
  type ExperimentSpecificationStore
} from "./experiment-specification-service.js";

const datasetRef: DatasetRef = {
  datasetId: "sha256:sentiment-input-fixture",
  version: 1,
  manifestVersion: "v1",
  provider: "fixture",
  symbols: ["BTCUSDT"],
  timeframe: "1h",
  range: { startTime: 1, endTime: 2 },
  revisionWatermark: 0,
  integrityHash: "fixture"
};

const execution = {
  initialCapital: 10_000,
  feeRate: 0.001,
  slippageRate: 0.0005,
  signalTiming: "close-of-bar" as const,
  fillRule: "next-open" as const,
  maxConcurrentPositions: 1 as const,
  leverage: 1 as const,
  positionSizing: "available-equity" as const,
  allowedDirections: ["long", "short"] as const,
  stopLoss: { enabled: false } as const,
  takeProfit: { enabled: false } as const,
  sameBarExitPriority: "stop-loss-first" as const,
  finalPositionPolicy: "liquidate-at-final-close" as const,
  decimalPlaces: 8 as const
};

const provenance: FreezeProvenance = {
  engine: { id: "backtester", version: "1.0.0" },
  nodeRuntimeVersion: "22.20.0",
  dependencyLockHash: "a".repeat(64),
  applicationCommit: "fixture-app",
  workerCommit: "fixture-worker",
  deterministicConfigVersion: "1.0.0"
};

class FixtureStrategy implements Strategy {
  constructor(
    readonly descriptor: Strategy["descriptor"]
  ) {}

  evaluate(): StrategyResult {
    return { signal: { action: "hold", effectiveTime: 0 }, annotations: [] };
  }
}

class MemorySpecificationStore implements ExperimentSpecificationStore {
  private readonly values = new Map<string, ExperimentSpecification>();

  async create(specId: string, content: ExperimentDraftContent): Promise<DraftExperimentSpecification> {
    const created: DraftExperimentSpecification = {
      specId,
      status: "draft",
      content,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z"
    };
    this.values.set(specId, created);
    return created;
  }

  async updateDraft(specId: string, content: ExperimentDraftContent): Promise<DraftExperimentSpecification> {
    const existing = this.values.get(specId);
    if (existing === undefined || existing.status !== "draft") throw new Error("fixture draft missing");
    const updated = { ...existing, content };
    this.values.set(specId, updated);
    return updated;
  }

  async freeze(
    specId: string,
    content: FrozenExperimentContent,
    contentHash: string
  ): Promise<FrozenExperimentSpecification> {
    const frozen: FrozenExperimentSpecification = {
      specId,
      status: "frozen",
      content,
      contentHash,
      frozenAt: "2026-08-31T00:00:00.000Z",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z"
    };
    this.values.set(specId, frozen);
    return frozen;
  }

  async find(specId: string): Promise<ExperimentSpecification | undefined> {
    return this.values.get(specId);
  }
}

function draft(strategyId: string): ExperimentDraftContent {
  return {
    schemaVersion: "v1",
    datasetRef,
    strategy: { id: strategyId, version: "1.0.0", parameters: {} },
    execution,
    metricSet: { id: "mvp", version: "1.0.0" }
  };
}

function sentimentInput() {
  return {
    windowDurationMs: 60_000,
    policy: {
      maxAgeMs: 30_000,
      onMissing: { action: "block" as const },
      onStale: { action: "degrade" as const }
    }
  };
}

function sentimentDraft() {
  return {
    ...draft("sentiment-fixture"),
    strategy: {
      id: "sentiment-fixture",
      version: "1.0.0",
      parameters: { windowDurationMs: 60_000 }
    }
  } as ExperimentDraftContent;
}

function service(composites?: CompositeStrategyService): ExperimentSpecificationService {
  const datasets: DatasetService = {
    createDataset: async () => { throw new Error("not used"); },
    resolveDataset: async (ref) => ({ manifest: { ref, candleCount: 0, gaps: [] }, candles: [] })
  };
  const technical = new FixtureStrategy({
    id: "technical-fixture",
    version: "1.0.0",
    name: "Technical fixture",
    description: "No sentiment required",
    category: "trend",
    capabilities: ["long"],
    parameterSchema: { properties: {}, required: [] },
    requiredInputs: ["price-bars"],
    implementation: { kind: "built-in", key: "technical-fixture" }
  });
  const sentiment = new FixtureStrategy({
    id: "sentiment-fixture",
    version: "1.0.0",
    name: "Sentiment fixture",
    description: "Sentiment required",
    category: "sentiment",
    capabilities: ["sentiment"],
    parameterSchema: {
      properties: {
        windowDurationMs: {
          type: "integer", label: "Sentiment window", minimum: 60_000, maximum: 604_800_000
        }
      },
      required: ["windowDurationMs"]
    },
    requiredInputs: ["sentiment-series"],
    implementation: { kind: "built-in", key: "sentiment-fixture" }
  });
  return new ExperimentSpecificationService(new MemorySpecificationStore(), datasets, new StrategyRegistry([
    technical,
    sentiment
  ]), composites);
}

describe("ExperimentSpecificationService sentiment input", () => {
  it("requires explicit sentiment configuration for a sentiment-dependent descriptor", async () => {
    const specifications = service();
    const created = await specifications.createDraft(sentimentDraft());

    await expect(specifications.freeze(created.specId, provenance)).rejects.toThrow(
      "EXPERIMENT_FIELD_REQUIRED: sentimentInput"
    );
  });

  it("freezes the sentiment policy with a sentiment-dependent specification", async () => {
    const specifications = service();
    const content = { ...sentimentDraft(), sentimentInput: sentimentInput() } as ExperimentDraftContent;
    const created = await specifications.createDraft(content);

    await expect(specifications.freeze(created.specId, provenance)).resolves.toMatchObject({
      content: { sentimentInput: sentimentInput() }
    });
  });

  it("forbids sentiment configuration for a technical-only descriptor", async () => {
    const specifications = service();
    const content = { ...draft("technical-fixture"), sentimentInput: sentimentInput() } as ExperimentDraftContent;
    const created = await specifications.createDraft(content);

    await expect(specifications.freeze(created.specId, provenance)).rejects.toThrow(
      "EXPERIMENT_FIELD_FORBIDDEN: sentimentInput"
    );
  });

  it("rejects a frozen sentiment input whose window disagrees with the selected descriptor", async () => {
    const specifications = service();
    const content = {
      ...sentimentDraft(),
      strategy: {
        id: "sentiment-fixture",
        version: "1.0.0",
        parameters: { windowDurationMs: 3_600_000 }
      },
      sentimentInput: sentimentInput()
    } as ExperimentDraftContent;
    const created = await specifications.createDraft(content);

    await expect(specifications.freeze(created.specId, provenance)).rejects.toThrow(
      "EXPERIMENT_SENTIMENT_WINDOW_MISMATCH"
    );
  });

  it("freezes an explicit sentiment input for a composite that contains the sentiment descriptor", async () => {
    const definition: CompositeStrategyDefinition = {
      id: "sentiment-composite",
      version: "1.0.0",
      name: "Sentiment composite",
      description: "Fixture",
      components: [
        { id: "sentiment-fixture", version: "1.0.0", parameters: { windowDurationMs: 60_000 } },
        { id: "technical-fixture", version: "1.0.0", parameters: {} }
      ],
      policy: { id: "majority-vote", version: "1.0.0", configuration: {} }
    };
    const composites = {
      resolve: async () => ({
        descriptor: { requiredInputs: ["price-bars"] },
        definition
      })
    } as unknown as CompositeStrategyService;
    const specifications = service(composites);
    const content = {
      ...draft("sentiment-composite"),
      sentimentInput: sentimentInput()
    } as ExperimentDraftContent;
    const created = await specifications.createDraft(content);

    await expect(specifications.freeze(created.specId, provenance)).resolves.toMatchObject({
      content: { sentimentInput: sentimentInput() }
    });
  });
});
