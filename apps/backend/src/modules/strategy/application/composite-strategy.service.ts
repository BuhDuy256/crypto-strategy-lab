import { randomUUID } from "node:crypto";
import { CompositeStrategy, type CompositeStrategyDefinition } from "../domain/composite-strategy.js";
import type { AnalysisContext, Strategy, StrategyResult } from "../domain/strategy.js";
import type { StrategyRegistry } from "./strategy-registry.js";
import type { CombinationPolicyRegistry } from "./combination-policy-registry.js";

export interface CompositeDefinitionStore {
  save(definition: CompositeStrategyDefinition): Promise<void>;
  load(id: string): Promise<CompositeStrategyDefinition | null>;
  list(): Promise<CompositeStrategyDefinition[]>;
}

export function instantiateCompositeStrategy(
  definition: CompositeStrategyDefinition,
  strategyRegistry: StrategyRegistry,
  policyRegistry: CombinationPolicyRegistry
): CompositeStrategy {
  const components: Strategy[] = definition.components.map((reference) => {
    const runnable = strategyRegistry.resolve(reference);
    return {
      descriptor: runnable.descriptor,
      validateParameters: runnable.validateParameters,
      evaluate: (context, parameters) => runnable.run(context, parameters)
    };
  });
  return new CompositeStrategy(definition, components, policyRegistry.resolve(definition.policy));
}

export class CompositeStrategyService {
  constructor(
    private readonly compositeRepo: CompositeDefinitionStore,
    private readonly strategyRegistry: StrategyRegistry,
    private readonly policyRegistry: CombinationPolicyRegistry
  ) {}

  async save(
    name: string,
    description: string,
    components: CompositeStrategyDefinition["components"],
    policy: CompositeStrategyDefinition["policy"]
  ): Promise<CompositeStrategyDefinition> {
    if (components.length < 2) {
      throw new Error("COMPOSITE_COMPONENTS: at least two components are required");
    }

    for (const ref of components) {
      const strategy = this.strategyRegistry.resolve(ref);
      try {
        strategy.validateParameters(ref.parameters);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "unknown validation error";
        throw new Error(`COMPONENT_INVALID: component ${ref.id} failed validation - ${message}`);
      }
    }
    
    const resolvedPolicy = this.policyRegistry.resolve(policy);
    resolvedPolicy.combine(
      components.map((component) => ({
        componentId: component.id,
        result: { signal: { action: "hold", effectiveTime: 0 }, annotations: [] }
      })),
      policy.configuration
    );

    const definition: CompositeStrategyDefinition = {
      id: `composite-${randomUUID()}`,
      version: "1.0.0",
      name,
      description,
      components,
      policy
    };

    await this.compositeRepo.save(definition);

    return definition;
  }

  async load(id: string): Promise<CompositeStrategyDefinition> {
    const composite = await this.compositeRepo.load(id);
    if (!composite) throw new Error(`COMPOSITE_NOT_FOUND: ${id}`);
    return composite;
  }

  async resolve(id: string, version: string): Promise<CompositeStrategy> {
    const definition = await this.load(id);
    if (definition.version !== version) {
      throw new Error(`COMPOSITE_VERSION_MISMATCH: expected ${definition.version}, received ${version}`);
    }
    return instantiateCompositeStrategy(definition, this.strategyRegistry, this.policyRegistry);
  }

  async evaluate(id: string, context: AnalysisContext): Promise<StrategyResult> {
    const definition = await this.load(id);
    return instantiateCompositeStrategy(definition, this.strategyRegistry, this.policyRegistry)
      .evaluate(context, {});
  }

  async list(): Promise<CompositeStrategyDefinition[]> {
    return this.compositeRepo.list();
  }
}
