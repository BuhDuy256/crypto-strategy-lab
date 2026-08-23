// Public surface of the strategy module. Nothing else in this module is
// importable from outside it.
export { StrategyModule } from "./strategy.module.js";
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
  Signal,
  SignalAction,
  Strategy,
  StrategyCapability,
  StrategyCategory,
  StrategyDescriptor,
  StrategyResult
} from "./domain/strategy.js";
