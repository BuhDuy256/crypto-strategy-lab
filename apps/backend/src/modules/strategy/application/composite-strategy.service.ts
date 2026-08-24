import { randomUUID } from "node:crypto";
import { CompositeStrategy, type CompositeStrategyDefinition } from "../domain/composite-strategy.js";
import type { StrategyRegistry } from "./strategy-registry.js";
import type { PostgresCompositeRepository } from "../infrastructure/postgres-composite-repository.js";
import type { CombinationPolicyRegistry } from "./combination-policy-registry.js";

export class CompositeStrategyService {
  constructor(
    private readonly compositeRepo: PostgresCompositeRepository,
    private readonly strategyRegistry: StrategyRegistry,
    private readonly policyRegistry: CombinationPolicyRegistry
  ) {}

  async save(
    name: string,
    description: string,
    components: CompositeStrategyDefinition["components"],
    policy: CompositeStrategyDefinition["policy"]
  ): Promise<CompositeStrategyDefinition> {
    // 1. Validate every component
    for (const ref of components) {
      const strategy = this.strategyRegistry.resolve(ref);
      try {
        strategy.validateParameters(ref.parameters);
      } catch (err: any) {
        throw new Error(`COMPONENT_INVALID: component ${ref.id} failed validation - ${err.message}`);
      }
    }
    
    // 2. Validate policy exists
    this.policyRegistry.resolve(policy);

    // 3. Create definition
    const definition: CompositeStrategyDefinition = {
      id: `composite-${randomUUID()}`,
      version: "1.0.0",
      name,
      description,
      components,
      policy
    };

    // 4. Save immutably
    await this.compositeRepo.save(definition);

    return definition;
  }

  async load(id: string): Promise<CompositeStrategyDefinition> {
    const composite = await this.compositeRepo.load(id);
    if (!composite) throw new Error(`COMPOSITE_NOT_FOUND: ${id}`);
    return composite;
  }

  async list(): Promise<CompositeStrategyDefinition[]> {
    return this.compositeRepo.list();
  }
}
