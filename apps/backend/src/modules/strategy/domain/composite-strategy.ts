import type { StrategyParameters } from "./parameter-schema.js";
import type { AnalysisContext, Strategy, StrategyDescriptor, StrategyResult } from "./strategy.js";
import type { CombinationPolicy } from "./combination-policy.js";

export interface ComponentStrategyReference {
  readonly id: string;
  readonly version: string;
  readonly parameters: StrategyParameters;
}

export interface CombinationPolicyReference {
  readonly id: string;
  readonly version: string;
  readonly configuration: Record<string, unknown>;
}

export interface CompositeStrategyDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly components: readonly ComponentStrategyReference[];
  readonly policy: CombinationPolicyReference;
}

export class CompositeStrategy implements Strategy {
  readonly descriptor: StrategyDescriptor;
  readonly definition: CompositeStrategyDefinition;

  constructor(
    definition: CompositeStrategyDefinition,
    private readonly componentStrategies: readonly Strategy[],
    private readonly policy: CombinationPolicy
  ) {
    if (definition.components.length !== componentStrategies.length) {
      throw new Error("COMPOSITE_STRATEGY: components length must match strategies length");
    }

    // Freeze to ensure immutability as per constraint
    this.definition = Object.freeze(JSON.parse(JSON.stringify(definition)));

    this.descriptor = {
      id: this.definition.id,
      version: this.definition.version,
      name: this.definition.name,
      description: this.definition.description,
      category: "composite",
      capabilities: ["long", "short", "annotations"],
      parameterSchema: { properties: {}, required: [] },
      requiredInputs: ["price-bars"],
      implementation: { kind: "built-in", key: "composite" }
    };
  }

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    const componentResults = this.componentStrategies.map((strategy, index) => {
      const ref = this.definition.components[index]!;
      const result = strategy.evaluate(context, ref.parameters);
      return { componentId: ref.id, result };
    });

    return this.policy.combine(componentResults, this.definition.policy.configuration);
  }
}
