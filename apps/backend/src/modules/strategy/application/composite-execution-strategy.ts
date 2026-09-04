// Execution-only composite descriptor assembly. The persisted composite remains unchanged.

import type { CompositeStrategyDefinition } from "../domain/composite-strategy.js";
import type { AnalysisInputKind, Strategy, StrategyDescriptor } from "../domain/strategy.js";
import type { CombinationPolicyRegistry } from "./combination-policy-registry.js";
import { instantiateCompositeStrategy } from "./composite-strategy.service.js";
import type { StrategyRegistry } from "./strategy-registry.js";

const ANALYSIS_INPUT_ORDER: readonly AnalysisInputKind[] = ["price-bars", "sentiment-series"];

/**
 * Forms the stable union that the StrategyRegistry must see before it filters a
 * composite's execution context. This is intentionally outside CompositeStrategy:
 * its persisted descriptor and combination policy remain unchanged.
 */
export function compositeExecutionDescriptor(
  descriptor: StrategyDescriptor,
  componentDescriptors: readonly Pick<StrategyDescriptor, "requiredInputs">[]
): StrategyDescriptor {
  const requiredInputs = ANALYSIS_INPUT_ORDER.filter((kind) =>
    componentDescriptors.some((component) => component.requiredInputs.includes(kind))
  );
  return { ...descriptor, requiredInputs };
}

/** Builds the worker-only runnable wrapper for a persisted composite definition. */
export function createCompositeExecutionStrategy(
  definition: CompositeStrategyDefinition,
  strategies: StrategyRegistry,
  policies: CombinationPolicyRegistry
): Strategy {
  const composite = instantiateCompositeStrategy(definition, strategies, policies);
  return {
    descriptor: compositeExecutionDescriptor(
      composite.descriptor,
      definition.components.map((reference) => strategies.resolve(reference).descriptor)
    ),
    evaluate: (context, parameters) => composite.evaluate(context, parameters)
  };
}
