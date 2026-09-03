// Assembles and freezes the specification for one single-strategy backtest.
//
// This is the single-run counterpart of SearchExperimentCreationService, and it
// exists for the same two reasons. First, a run only produces an accepted result
// when its frozen provenance matches the backtest runner's runtime identity, and
// the browser cannot know that identity; the API process, which shares the
// runner's build environment, stamps it here. Second, the execution model and the
// metric set are architecture-owned V1 decisions, not user choices, so they are
// filled in here rather than sent from the interface.
//
// The caller supplies only what a person actually chooses: the dataset window and
// the strategy with its parameters. The dataset reference is resolved into a real
// content-addressed manifest through the Market module, never invented by the
// caller. Strategy existence and parameter validity are enforced by
// ExperimentSpecificationService.freeze, so this service does not re-check them.

import type { CreateDatasetRequest, DatasetManifest, Timeframe } from "../../market/index.js";
import type { StrategyParameters } from "../../strategy/index.js";
import { MVP_METRIC_SET } from "../domain/evaluator.js";
import type {
  DraftExperimentSpecification,
  ExecutionModelConfiguration,
  ExperimentDraftContent,
  FreezeProvenance,
  FrozenExperimentSpecification
} from "../domain/experiment-specification.js";
import type { SentimentInputConfiguration } from "../domain/sentiment-input.js";

// The dataset window and the strategy a person chooses for a single run.
export interface CreateSingleBacktestExperimentInput {
  readonly dataset: {
    readonly provider: string;
    readonly symbol: string;
    readonly timeframe: Timeframe;
    readonly range: { readonly startTime: number; readonly endTime: number };
  };
  readonly strategy: {
    readonly id: string;
    readonly version: string;
    readonly parameters: StrategyParameters;
  };
  /** Required by freeze only when the selected descriptor declares sentiment-series. */
  readonly sentimentInput?: SentimentInputConfiguration;
}

// Narrow ports this service needs. The concrete Market and Experiment services
// satisfy these structurally, so production passes them directly.
export interface SingleBacktestDatasets {
  createDataset(request: CreateDatasetRequest): Promise<DatasetManifest>;
}

export interface SingleBacktestSpecifications {
  createDraft(content: ExperimentDraftContent): Promise<DraftExperimentSpecification>;
  freeze(specId: string, provenance: FreezeProvenance): Promise<FrozenExperimentSpecification>;
}

// The fixed V1 execution profile every experiment shares (the accepted V1 model).
// Counterpart: `V1_EXECUTION` in search-experiment-creation-service.ts. Both must
// stay inside the profile `assertDraft` accepts in
// experiment-specification-service.ts.
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

export class SingleBacktestExperimentCreationService {
  constructor(
    private readonly datasets: SingleBacktestDatasets,
    private readonly specifications: SingleBacktestSpecifications,
    private readonly provenance: FreezeProvenance
  ) {}

  async create(input: CreateSingleBacktestExperimentInput): Promise<{ readonly specId: string }> {
    const manifest = await this.datasets.createDataset({
      provider: input.dataset.provider,
      symbol: input.dataset.symbol,
      timeframe: input.dataset.timeframe,
      range: input.dataset.range
    });

    const content: ExperimentDraftContent = {
      schemaVersion: "v1",
      datasetRef: manifest.ref,
      strategy: {
        id: input.strategy.id,
        version: input.strategy.version,
        parameters: input.strategy.parameters
      },
      ...(input.sentimentInput === undefined ? {} : { sentimentInput: input.sentimentInput }),
      execution: V1_EXECUTION,
      metricSet: { id: MVP_METRIC_SET.id, version: MVP_METRIC_SET.version }
    };

    const draft = await this.specifications.createDraft(content);
    const frozen = await this.specifications.freeze(draft.specId, this.provenance);
    return { specId: frozen.specId };
  }
}
