// Public surface of the strategy module. Nothing else in this module is
// importable from outside it.
export { StrategyRegistry } from "./application/strategy-registry.js";
export { createBuiltInStrategyRegistry } from "./application/built-in-strategy-registry.js";
export type { RunnableStrategy, StrategyRef } from "./application/strategy-registry.js";
export type {
  Annotation,
  AnnotationPoint,
  LineAnnotation,
  BandAnnotation,
  ZoneAnnotation,
  LevelAnnotation,
  MarkerAnnotation
} from "./domain/annotation.js";
export type {
  ParameterDefinition,
  ParameterSchema,
  StrategyParameters,
  StrategyParameterValue
} from "./domain/parameter-schema.js";
export type {
  AnalysisContext,
  AnalysisInput,
  AnalysisInputKind,
  PriceBar,
  SentimentSeriesInput,
  Signal,
  SignalAction,
  Strategy,
  StrategyCapability,
  StrategyCategory,
  StrategyDescriptor,
  StrategyResult
} from "./domain/strategy.js";
export {
  CompositeStrategyService,
  instantiateCompositeStrategy
} from "./application/composite-strategy.service.js";
export { CombinationPolicyRegistry } from "./application/combination-policy-registry.js";
export { createBuiltInCombinationPolicyRegistry } from "./application/built-in-combination-policy-registry.js";
export type { CombinationPolicy } from "./domain/combination-policy.js";
export type { ComponentResult } from "./domain/combination-policy.js";
export type {
  CompositeStrategyDefinition,
  ComponentStrategyReference,
  CombinationPolicyReference
} from "./domain/composite-strategy.js";
export { createCandidateStrategy } from "./application/candidate-strategy-factory.js";
export type { CreateCandidateInput } from "./application/candidate-strategy-factory.js";
export type {
  CandidateStrategy,
  CandidateStrategySpecification,
  CandidateSingleStrategySpecification,
  CandidateCompositeStrategySpecification,
  GeneratorProvenance
} from "./domain/candidate-strategy.js";
export { StrategyGeneratorRegistry } from "./application/strategy-generator-registry.js";
export type { GeneratorRef } from "./application/strategy-generator-registry.js";
export { createBuiltInStrategyGeneratorRegistry } from "./application/built-in-strategy-generator-registry.js";
export { RandomStrategyGenerator } from "./application/random-strategy-generator.js";
export { GridStrategyGenerator } from "./application/grid-strategy-generator.js";
export type {
  StrategyGenerator,
  GeneratorDescriptor,
  GenerateRequest,
  SearchSpace,
  ParameterRange,
  VersionedRef
} from "./domain/strategy-generator.js";
export { StrategyModule } from "./strategy.module.js";
