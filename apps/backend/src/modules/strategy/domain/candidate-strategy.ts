// The candidate strategy contract. A candidate carries a complete, immutable
// strategy or composite specification, the provenance of the generator that
// produced it, and a stable content hash. It is the boundary that separates
// automated search from everything downstream: nothing downstream may branch on
// how a candidate was produced.

import type { StrategyParameters } from "./parameter-schema.js";
import type { CompositeStrategyDefinition } from "./composite-strategy.js";

// A complete single-strategy specification. Version is always explicit; a
// candidate never resolves through a "latest" alias.
export interface CandidateSingleStrategySpecification {
  readonly kind: "single";
  readonly id: string;
  readonly version: string;
  readonly parameters: StrategyParameters;
}

// A complete composite specification. The composite definition already pins
// component versions and the combination policy.
export interface CandidateCompositeStrategySpecification {
  readonly kind: "composite";
  readonly composite: CompositeStrategyDefinition;
}

export type CandidateStrategySpecification =
  | CandidateSingleStrategySpecification
  | CandidateCompositeStrategySpecification;

// Provenance of the generator that produced a candidate. It travels with the
// candidate but downstream code treats the generator as opaque.
export interface GeneratorProvenance {
  readonly id: string;
  readonly version: string;
  readonly configuration: Record<string, unknown>;
  readonly seed: number | string;
}

export interface CandidateStrategy {
  readonly schemaVersion: "v1";
  readonly specification: CandidateStrategySpecification;
  readonly generator: GeneratorProvenance;
  readonly contentHash: string;
}
