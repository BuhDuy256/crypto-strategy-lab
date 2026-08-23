// CPU computation seam kept separate from runner lease orchestration.

import type { Candle } from "../../market/index.js";
import type { Annotation, Signal, StrategyRegistry } from "../../strategy/index.js";
import { Backtester, type BacktestOutput } from "../domain/backtester.js";
import { Evaluator, type EvaluationResult } from "../domain/evaluator.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";

export interface BacktestComputationInput {
  readonly specification: FrozenExperimentSpecification;
  readonly candles: readonly Candle[];
}

export interface BacktestComputationOutput {
  readonly simulation: BacktestOutput;
  readonly evaluation: EvaluationResult;
}

export interface BacktestComputation {
  compute(input: BacktestComputationInput, signal?: AbortSignal): Promise<BacktestComputationOutput>;
}

export function computeBacktest(
  input: BacktestComputationInput,
  strategies: StrategyRegistry
): BacktestComputationOutput {
  const strategy = strategies.resolve(input.specification.content.strategy);
  const signals: Signal[] = [];
  let annotations: readonly Annotation[] = [];
  for (let index = 0; index < input.candles.length; index += 1) {
    const candle = input.candles[index];
    if (candle === undefined) continue;
    const result = strategy.run({
      evaluationTime: candle.closeTime,
      inputs: [{ kind: "price-bars", bars: input.candles.slice(0, index + 1) }]
    }, input.specification.content.strategy.parameters);
    signals.push(result.signal);
    annotations = result.annotations;
  }
  const simulation = new Backtester().run({
    candles: input.candles,
    signals,
    annotations,
    execution: input.specification.content.execution
  });
  return {
    simulation,
    evaluation: new Evaluator().evaluate({
      initialCapital: simulation.initialCapital,
      trades: simulation.trades
    })
  };
}

export class InlineBacktestComputation implements BacktestComputation {
  constructor(private readonly strategies: StrategyRegistry) {}

  async compute(input: BacktestComputationInput): Promise<BacktestComputationOutput> {
    return computeBacktest(input, this.strategies);
  }
}
