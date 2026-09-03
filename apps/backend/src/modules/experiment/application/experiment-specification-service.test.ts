// PostgreSQL-backed lifecycle tests for immutable experiment specifications.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatasetRef, DatasetService } from "../../market/index.js";
import {
  createBuiltInStrategyRegistry,
  StrategyRegistry,
  type CompositeStrategyDefinition,
  type Strategy,
  type StrategyResult
} from "../../strategy/index.js";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { ExperimentSpecificationService } from "./experiment-specification-service.js";
import type { ExperimentDraftContent, FreezeProvenance } from "../domain/experiment-specification.js";
import { PostgresExperimentSpecificationStore } from "../infrastructure/postgres-experiment-specification-store.js";

const datasetRef: DatasetRef = {
  datasetId: "sha256:dataset",
  version: 1,
  manifestVersion: "v1",
  provider: "proof-provider",
  symbols: ["BTCUSDT"],
  timeframe: "1h",
  range: { startTime: 1, endTime: 2 },
  revisionWatermark: 1,
  integrityHash: "dataset"
};

const draftContent: ExperimentDraftContent = {
  schemaVersion: "v1",
  datasetRef,
  strategy: {
    id: "test-strategy",
    version: "1.0.0",
    parameters: { period: 2 }
  },
  execution: {
    initialCapital: 10_000,
    feeRate: 0.001,
    slippageRate: 0.0005,
    signalTiming: "close-of-bar",
    fillRule: "next-open",
    maxConcurrentPositions: 1,
    leverage: 1,
    positionSizing: "available-equity",
    allowedDirections: ["long", "short"],
    stopLoss: { enabled: false },
    takeProfit: { enabled: false },
    sameBarExitPriority: "stop-loss-first",
    finalPositionPolicy: "liquidate-at-final-close",
    decimalPlaces: 8
  },
  metricSet: { id: "mvp", version: "1.0.0" }
};

const provenance: FreezeProvenance = {
  engine: { id: "backtester", version: "1.0.0" },
  nodeRuntimeVersion: "22.20.0",
  dependencyLockHash: "a".repeat(64),
  applicationCommit: "abc1234",
  workerCommit: "abc1234",
  deterministicConfigVersion: "1.0.0"
};

class TestStrategy implements Strategy {
  readonly descriptor = {
    id: "test-strategy",
    version: "1.0.0",
    name: "Test strategy",
    description: "Experiment specification fixture",
    category: "trend" as const,
    capabilities: ["long"] as const,
    parameterSchema: {
      properties: { period: { type: "integer" as const, label: "Period", minimum: 2 } },
      required: ["period"]
    },
    requiredInputs: ["price-bars"] as const,
    implementation: { kind: "built-in" as const, key: "test-strategy" }
  };

  evaluate(): StrategyResult {
    return { signal: { action: "hold", effectiveTime: 0 }, annotations: [] };
  }
}

describe("ExperimentSpecificationService", () => {
  let pool: Pool;
  let service: ExperimentSpecificationService;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    const datasets: DatasetService = {
      async createDataset() {
        throw new Error("not used");
      },
      async resolveDataset(ref) {
        return { manifest: { ref, candleCount: 0, gaps: [] }, candles: [] };
      }
    };
    service = new ExperimentSpecificationService(
      new PostgresExperimentSpecificationStore(pool),
      datasets,
      new StrategyRegistry([new TestStrategy()])
    );
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE experiment.specifications CASCADE");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("edits a draft and reads it after a new service instance", async () => {
    const created = await service.createDraft(draftContent);
    await service.updateDraft(created.specId, {
      ...draftContent,
      strategy: { ...draftContent.strategy, parameters: { period: 3 } }
    });
    const restarted = new ExperimentSpecificationService(
      new PostgresExperimentSpecificationStore(pool),
      {
        createDataset: async () => { throw new Error("not used"); },
        resolveDataset: async (ref) => ({ manifest: { ref, candleCount: 0, gaps: [] }, candles: [] })
      },
      new StrategyRegistry([new TestStrategy()])
    );

    await expect(restarted.get(created.specId)).resolves.toMatchObject({
      status: "draft",
      content: { strategy: { parameters: { period: 3 } } }
    });
  });

  it("freezes identical content with the same canonical hash", async () => {
    const first = await service.createDraft(draftContent);
    const second = await service.createDraft(draftContent);
    const frozenFirst = await service.freeze(first.specId, provenance);
    const frozenSecond = await service.freeze(second.specId, provenance);

    expect(frozenFirst.contentHash).toBe(frozenSecond.contentHash);
  });

  it("rejects invalid strategy parameters and names the field", async () => {
    const draft = await service.createDraft({
      ...draftContent,
      strategy: { ...draftContent.strategy, parameters: {} }
    });
    await expect(service.freeze(draft.specId, provenance)).rejects.toThrow("period");
  });

  it("rejects version aliases", async () => {
    const draft = await service.createDraft({
      ...draftContent,
      strategy: { ...draftContent.strategy, version: "latest" }
    });
    await expect(service.freeze(draft.specId, provenance)).rejects.toThrow("strategy.version");

    const validDraft = await service.createDraft(draftContent);
    await expect(
      service.freeze(validDraft.specId, { ...provenance, nodeRuntimeVersion: "latest" })
    ).rejects.toThrow("provenance.nodeRuntimeVersion");
  });

  it("rejects a missing nested execution field by name", async () => {
    const incomplete = {
      ...draftContent,
      execution: { ...draftContent.execution, fillRule: undefined }
    } as unknown as ExperimentDraftContent;
    const draft = await service.createDraft(incomplete);

    await expect(service.freeze(draft.specId, provenance)).rejects.toThrow("execution.fillRule");
  });

  it("rejects an unsupported runtime specification schema version", async () => {
    const unsupported = { ...draftContent, schemaVersion: "v2" } as unknown as ExperimentDraftContent;
    const draft = await service.createDraft(unsupported);

    await expect(service.freeze(draft.specId, provenance)).rejects.toThrow(
      "schemaVersion must be v1"
    );
  });

  it("rejects a missing nested dataset field by name", async () => {
    const incomplete = {
      ...draftContent,
      datasetRef: {
        ...draftContent.datasetRef,
        range: { ...draftContent.datasetRef.range, startTime: undefined }
      }
    } as unknown as ExperimentDraftContent;
    const draft = await service.createDraft(incomplete);

    await expect(service.freeze(draft.specId, provenance)).rejects.toThrow(
      "datasetRef.range.startTime"
    );
  });

  it("rejects a missing nested provenance object by name", async () => {
    const draft = await service.createDraft(draftContent);
    const incomplete = { ...provenance, engine: undefined } as unknown as FreezeProvenance;

    await expect(service.freeze(draft.specId, incomplete)).rejects.toThrow("provenance.engine");
  });

  it("reads the complete frozen specification after a service restart", async () => {
    const draft = await service.createDraft(draftContent);
    const frozen = await service.freeze(draft.specId, provenance);
    const restarted = new ExperimentSpecificationService(
      new PostgresExperimentSpecificationStore(pool),
      {
        createDataset: async () => { throw new Error("not used"); },
        resolveDataset: async (ref) => ({ manifest: { ref, candleCount: 0, gaps: [] }, candles: [] })
      },
      new StrategyRegistry([new TestStrategy()])
    );

    await expect(restarted.get(draft.specId)).resolves.toEqual(frozen);
  });

  it("rejects application and database updates after freezing", async () => {
    const draft = await service.createDraft(draftContent);
    await service.freeze(draft.specId, provenance);

    await expect(service.updateDraft(draft.specId, draftContent)).rejects.toThrow("frozen");
    await expect(
      pool.query("UPDATE experiment.specifications SET content = '{}'::jsonb WHERE spec_id = $1", [
        draft.specId
      ])
    ).rejects.toThrow("experiment specifications are immutable after freeze");
  });

  describe("inline composite definitions (FIN-01)", () => {
    // A generated composite candidate has no saved-composite record, so it must
    // resolve required inputs and reach a distinct canonical hash from its
    // inline definition alone, never from a CompositeStrategyService lookup.
    let compositeService: ExperimentSpecificationService;

    beforeAll(() => {
      compositeService = new ExperimentSpecificationService(
        new PostgresExperimentSpecificationStore(pool),
        {
          createDataset: async () => { throw new Error("not used"); },
          resolveDataset: async (ref) => ({ manifest: { ref, candleCount: 0, gaps: [] }, candles: [] })
        },
        createBuiltInStrategyRegistry()
        // No CompositeStrategyService: the inline path must not need one.
      );
    });

    const baseComposite: CompositeStrategyDefinition = {
      id: "generated-composite",
      version: "1.0.0",
      name: "Composite of rsi + moving-average",
      description: "Generated by random-search.",
      components: [
        { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" } },
        { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 30, priceSource: "close" } }
      ],
      policy: { id: "majority-vote", version: "1.0.0", configuration: {} }
    };

    function contentFor(composite: CompositeStrategyDefinition): ExperimentDraftContent {
      return {
        ...draftContent,
        strategy: { id: composite.id, version: composite.version, parameters: {} },
        compositeDefinition: composite
      };
    }

    it("freezes two structurally different inline composite definitions to different canonical content", async () => {
      const other: CompositeStrategyDefinition = {
        ...baseComposite,
        components: [
          { ...baseComposite.components[0]!, parameters: { ...baseComposite.components[0]!.parameters, period: 20 } },
          baseComposite.components[1]!
        ]
      };

      const draftA = await compositeService.createDraft(contentFor(baseComposite));
      const draftB = await compositeService.createDraft(contentFor(other));
      const frozenA = await compositeService.freeze(draftA.specId, provenance);
      const frozenB = await compositeService.freeze(draftB.specId, provenance);

      expect(frozenA.contentHash).not.toBe(frozenB.contentHash);
      expect(frozenA.content.compositeDefinition).toEqual(baseComposite);
    });

    it("rejects a strategy reference that disagrees with the inline definition", async () => {
      const draft = await compositeService.createDraft({
        ...contentFor(baseComposite),
        strategy: { id: "generated-composite", version: "2.0.0", parameters: {} }
      });

      await expect(compositeService.freeze(draft.specId, provenance)).rejects.toThrow(
        "EXPERIMENT_COMPOSITE_DEFINITION_MISMATCH"
      );
    });
  });
});
