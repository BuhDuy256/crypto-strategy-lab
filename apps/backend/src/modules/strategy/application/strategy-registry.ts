// Startup-assembled Strategy registry that validates every run through one wrapper.

import type { StrategyParameters } from "../domain/parameter-schema.js";
import { validateParameters } from "../domain/parameter-schema.js";
import type {
  AnalysisContext,
  Strategy,
  StrategyDescriptor,
  StrategyResult
} from "../domain/strategy.js";

export interface StrategyRef {
  readonly id: string;
  readonly version: string;
}

export interface RunnableStrategy {
  readonly descriptor: StrategyDescriptor;
  validateParameters(parameters: StrategyParameters): void;
  run(context: AnalysisContext, parameters: StrategyParameters): StrategyResult;
}

function keyOf(ref: StrategyRef): string {
  return `${ref.id}@${ref.version}`;
}

function assertDescriptor(descriptor: StrategyDescriptor): void {
  if (!/^[a-z][a-z0-9-]*$/.test(descriptor.id)) {
    throw new Error(`STRATEGY_ID: invalid stable identifier ${descriptor.id}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(descriptor.version)) {
    throw new Error(`STRATEGY_VERSION: ${descriptor.version} is not a semantic version`);
  }
  for (const required of descriptor.parameterSchema.required) {
    if (descriptor.parameterSchema.properties[required] === undefined) {
      throw new Error(`STRATEGY_SCHEMA: required field ${required} has no definition`);
    }
  }
}

function assertResult(result: StrategyResult): void {
  if (!(["buy", "sell", "hold"] as const).includes(result.signal.action)) {
    throw new Error(`STRATEGY_SIGNAL_ACTION: unsupported action ${String(result.signal.action)}`);
  }
  if (!Number.isSafeInteger(result.signal.effectiveTime)) {
    throw new Error("STRATEGY_SIGNAL_TIME: effectiveTime must be a safe integer");
  }
  const confidence = result.signal.confidence;
  if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new Error("STRATEGY_SIGNAL_CONFIDENCE: confidence must be between 0 and 1");
  }
}

export class StrategyRegistry {
  private readonly strategies = new Map<string, Strategy>();

  constructor(strategies: readonly Strategy[] = []) {
    for (const strategy of strategies) {
      this.register(strategy);
    }
  }

  register(strategy: Strategy): void {
    assertDescriptor(strategy.descriptor);
    const key = keyOf(strategy.descriptor);
    if (this.strategies.has(key)) {
      throw new Error(`STRATEGY_ALREADY_REGISTERED: ${key}`);
    }
    this.strategies.set(key, strategy);
  }

  list(): readonly StrategyDescriptor[] {
    return [...this.strategies.values()].map((strategy) => strategy.descriptor);
  }

  resolve(ref: StrategyRef): RunnableStrategy {
    const strategy = this.strategies.get(keyOf(ref));
    if (strategy === undefined) {
      throw new Error(`STRATEGY_NOT_FOUND: ${keyOf(ref)}`);
    }
    return {
      descriptor: strategy.descriptor,
      validateParameters: (parameters) => {
        validateParameters(strategy.descriptor.parameterSchema, parameters);
      },
      run: (context, parameters) => {
        validateParameters(strategy.descriptor.parameterSchema, parameters);
        const required = new Set(strategy.descriptor.requiredInputs);
        const inputs = context.inputs.filter((input) => required.has(input.kind));
        for (const kind of required) {
          if (!inputs.some((input) => input.kind === kind)) {
            throw new Error(`STRATEGY_INPUT_REQUIRED: missing input ${kind}`);
          }
        }
        const result = strategy.evaluate({ evaluationTime: context.evaluationTime, inputs }, parameters);
        assertResult(result);
        return result;
      }
    };
  }
}
