// The strategy generator port. A generator proposes candidate strategies from a
// declared, versioned, seeded search space. It returns candidates only: it never
// decides how many to make, when to stop, or what to do with them. That is the
// search coordinator's job (SEARCH-01). Downstream code treats the generator as
// opaque and never branches on which generator produced a candidate.

import type { ParameterSchema } from "./parameter-schema.js";
import type { CandidateStrategy } from "./candidate-strategy.js";

export interface VersionedRef {
  readonly id: string;
  readonly version: string;
}

export interface ParameterRange {
  readonly minimum: number;
  readonly maximum: number;
}

// The explicit space a generator draws from: which strategies, how many may be
// combined, which combination policies, and optional per-parameter ranges that
// narrow a strategy's own schema bounds (a range may not widen past what the
// strategy's schema already allows).
export interface SearchSpace {
  readonly strategies: readonly VersionedRef[];
  readonly compositeSizes: readonly number[];
  readonly policies: readonly VersionedRef[];
  readonly parameterRanges?: Readonly<Record<string, Readonly<Record<string, ParameterRange>>>>;
}

export interface GenerateRequest {
  readonly searchSpace: SearchSpace;
  readonly seed: number | string;
  readonly configuration: Record<string, unknown>;
}

export interface GeneratorDescriptor {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly configurationSchema: ParameterSchema;
}

export interface StrategyGenerator {
  readonly descriptor: GeneratorDescriptor;
  generate(request: GenerateRequest): Iterable<CandidateStrategy>;
}
