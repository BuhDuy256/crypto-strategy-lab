// CPU computation seam kept separate from runner lease orchestration.

import type { Candle } from "../../market/index.js";
import type {
  Annotation,
  CompositeStrategyDefinition,
  Signal,
  SentimentSeriesInput,
  StrategyRegistry
} from "../../strategy/index.js";
import { Backtester, type BacktestOutput } from "../domain/backtester.js";
import { Evaluator, type EvaluationResult } from "../domain/evaluator.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";

export interface BacktestSentimentEntry {
  readonly evaluationTime: number;
  readonly input: SentimentSeriesInput;
}

export interface BacktestComputationInput {
  readonly specification: FrozenExperimentSpecification;
  readonly candles: readonly Candle[];
  readonly compositeDefinition?: CompositeStrategyDefinition;
  /** Runner-assembled immutable News inputs. The worker never queries News itself. */
  readonly sentimentEntries?: readonly BacktestSentimentEntry[];
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
  const sentimentByEvaluationTime = new Map(
    input.sentimentEntries?.map((entry) => [entry.evaluationTime, entry.input])
  );
  const signals: Signal[] = [];
  let annotations: readonly Annotation[] = [];
  for (let index = 0; index < input.candles.length; index += 1) {
    const candle = input.candles[index];
    if (candle === undefined) continue;
    const sentiment = sentimentByEvaluationTime.get(candle.closeTime);
    const result = strategy.run({
      evaluationTime: candle.closeTime,
      inputs: [
        { kind: "price-bars", bars: input.candles.slice(0, index + 1) },
        ...(sentiment === undefined ? [] : [sentiment])
      ]
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
