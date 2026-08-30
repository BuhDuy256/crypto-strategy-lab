// Recompute a result's visualization annotations on demand.
//
// EXP-11 downsamples and stores annotations for a single manually-run backtest,
// but not for every search candidate. For a search result the annotations are
// recomputed here by re-running the run's frozen specification through the same
// deterministic backtester, then downsampled the same way, so the recompute
// reproduces exactly what acceptance would have stored. The result is never
// persisted as authoritative; it is a read, cached only for the request.

import type { DatasetService } from "../../market/index.js";
import {
  StrategyRegistry,
  type Annotation,
  type CompositeStrategyService
} from "../../strategy/index.js";
import { computeBacktest } from "./backtest-computation.js";
import { downsampleAnnotations } from "./annotation-downsampler.js";
import type { FrozenSpecificationReader } from "./backtest-runner-service.js";

// Resolves the frozen specification a durable run executed. For a search
// candidate this is the derived per-candidate specification; for a manual run it
// is the run's own specification.
export interface BacktestRunSpecLocator {
  specIdForRun(runId: string): Promise<string | undefined>;
}

export class SearchAnnotationRecompute {
  constructor(
    private readonly locator: BacktestRunSpecLocator,
    private readonly specifications: FrozenSpecificationReader,
    private readonly datasets: DatasetService,
    private readonly strategies: StrategyRegistry,
    private readonly composites?: CompositeStrategyService
  ) {}

  // Returns the recomputed annotations for `runId`, or undefined when the run is
  // unknown, so the transport can answer with a clear client error.
  async recompute(runId: string): Promise<readonly Annotation[] | undefined> {
    const specId = await this.locator.specIdForRun(runId);
    if (specId === undefined) return undefined;
    const specification = await this.specifications.get(specId);
    const dataset = await this.datasets.resolveDataset(specification.content.datasetRef);
    let executionStrategies = this.strategies;
    try {
      executionStrategies.resolve(specification.content.strategy);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith("STRATEGY_NOT_FOUND:") ||
        this.composites === undefined
      ) {
        throw error;
      }
      const composite = await this.composites.resolve(
        specification.content.strategy.id,
        specification.content.strategy.version
      );
      executionStrategies = new StrategyRegistry([composite]);
    }
    const { simulation } = computeBacktest(
      { specification, candles: dataset.candles },
      executionStrategies
    );
    return downsampleAnnotations(simulation.annotations);
  }
}
