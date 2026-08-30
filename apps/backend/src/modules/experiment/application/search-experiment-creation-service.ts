// Assembles and freezes a search experiment from a high-level request.
//
// A search run needs a complete frozen specification whose provenance matches the
// backtest runner's runtime identity; otherwise every candidate result is rejected
// at acceptance. The browser cannot know that provenance, so this service (in the
// API process, which shares the runner's build environment) stamps it. It also
// fills the fixed V1 parts a person does not choose per run: the execution model,
// the metric set, and the ranking policy. The caller chooses only the dataset
// window, the generator and its search space, the seed, and the stop conditions.
//
// The `strategy` field of the base specification is a valid template that each
// generated candidate replaces in its own derived specification (see
// experiment-specification.ts). It must still pass the strategy's own validation,
// because freeze enforces it, so the template uses the first allowed strategy with
// its schema default parameters.

import type { StrategyRegistry } from "../../strategy/index.js";
import type { SearchSpace, VersionedRef } from "../../strategy/index.js";
import type { StrategyParameters, ParameterSchema } from "../../strategy/index.js";
import type { CreateDatasetRequest, DatasetManifest, Timeframe } from "../../market/index.js";
import { MVP_METRIC_SET } from "../domain/evaluator.js";
import type {
  DraftExperimentSpecification,
  ExecutionModelConfiguration,
  ExperimentDraftContent,
  FreezeProvenance,
  FrozenExperimentSpecification
} from "../domain/experiment-specification.js";
import type { SearchConfiguration, SearchStopConditions } from "../domain/search-specification.js";

// The dataset window and search configuration a person chooses for a run.
export interface CreateSearchExperimentInput {
  readonly dataset: {
    readonly provider: string;
    readonly symbol: string;
    readonly timeframe: Timeframe;
    readonly range: { readonly startTime: number; readonly endTime: number };
  };
  readonly generator: {
    readonly id: string;
    readonly version: string;
    readonly configuration?: Record<string, unknown>;
  };
  readonly searchSpace: SearchSpace;
  readonly seed: number | string;
  readonly stopConditions: SearchStopConditions;
  readonly maxInFlight: number;
}

// Narrow ports the service needs. The concrete Market and Experiment services
// satisfy these structurally, so production passes them directly.
export interface SearchExperimentDatasets {
  createDataset(request: CreateDatasetRequest): Promise<DatasetManifest>;
}

export interface SearchExperimentSpecifications {
  createDraft(content: ExperimentDraftContent): Promise<DraftExperimentSpecification>;
  freeze(specId: string, provenance: FreezeProvenance): Promise<FrozenExperimentSpecification>;
}

// The fixed V1 execution profile every experiment shares (the accepted V1 model).
const V1_EXECUTION: ExecutionModelConfiguration = {
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
};

// The accepted V1 ranking policy and its configuration (SEARCH-03).
const V1_RANKING_POLICY: VersionedRef = { id: "weighted-return-drawdown", version: "1.0.0" };
const V1_RANKING_CONFIGURATION = {
  weights: { totalReturn: 1, maximumDrawdown: -1 },
  minTrades: 5
} as const;

function defaultParametersFor(schema: ParameterSchema): StrategyParameters {
  const parameters: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(schema.properties)) {
    if (definition.default !== undefined) {
      parameters[name] = definition.default;
    }
  }
  // The base template must be freezable on its own, so every required parameter
  // needs a default to draw from. A strategy without one cannot seed a template;
  // fail here with a clear reason instead of an opaque freeze-time rejection.
  const missing = schema.required.filter((name) => parameters[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `SEARCH_EXPERIMENT_STRATEGY_TEMPLATE: base strategy has required parameters without defaults: ${missing.join(", ")}`
    );
  }
  return parameters as StrategyParameters;
}

export class SearchExperimentCreationService {
  constructor(
    private readonly datasets: SearchExperimentDatasets,
    private readonly specifications: SearchExperimentSpecifications,
    private readonly strategies: StrategyRegistry,
    private readonly provenance: FreezeProvenance
  ) {}

  async create(input: CreateSearchExperimentInput): Promise<{ readonly specId: string }> {
    const base = input.searchSpace.strategies[0];
    if (base === undefined) {
      throw new Error("SEARCH_EXPERIMENT_NO_STRATEGY: the search space must allow at least one strategy");
    }
    const conditions = input.stopConditions;
    if (
      conditions.maxCandidates === undefined &&
      conditions.maxDurationMs === undefined &&
      conditions.noImprovementIterations === undefined
    ) {
      throw new Error("SEARCH_EXPERIMENT_NO_STOP_CONDITION: at least one stop condition is required");
    }
    if (!Number.isInteger(input.maxInFlight) || input.maxInFlight < 1) {
      throw new Error("SEARCH_EXPERIMENT_MAX_IN_FLIGHT: maxInFlight must be a positive integer");
    }

    const template = this.strategies.resolve(base);
    const parameters = defaultParametersFor(template.descriptor.parameterSchema);

    const manifest = await this.datasets.createDataset({
      provider: input.dataset.provider,
      symbol: input.dataset.symbol,
      timeframe: input.dataset.timeframe,
      range: input.dataset.range
    });

    const search: SearchConfiguration = {
      generator: { id: input.generator.id, version: input.generator.version },
      generatorConfiguration: input.generator.configuration ?? {},
      searchSpace: input.searchSpace,
      seed: input.seed,
      rankingPolicy: V1_RANKING_POLICY,
      rankingConfiguration: { ...V1_RANKING_CONFIGURATION },
      stopConditions: input.stopConditions,
      maxInFlight: input.maxInFlight
    };

    const content: ExperimentDraftContent = {
      schemaVersion: "v1",
      datasetRef: manifest.ref,
      strategy: { id: base.id, version: base.version, parameters },
      execution: V1_EXECUTION,
      metricSet: { id: MVP_METRIC_SET.id, version: MVP_METRIC_SET.version },
      search
    };

    const draft = await this.specifications.createDraft(content);
    const frozen = await this.specifications.freeze(draft.specId, this.provenance);
    return { specId: frozen.specId };
  }
}
