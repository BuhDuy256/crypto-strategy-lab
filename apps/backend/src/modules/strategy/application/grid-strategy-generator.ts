// Grid search generator: a second, deterministic search method behind the same
// StrategyGenerator port as random-search.
//
// It exists to prove search replaceability (PROOF-REPLACE-001): adding it needs
// only this file and a line in the built-in registry, with no change to the
// candidate type, the backtester, the evaluator, the ranking policy, the
// leaderboard projector, or any consumer. Downstream code stays opaque to which
// generator produced a candidate.
//
// Unlike random-search it draws no randomness: for each strategy in the search
// space it enumerates the cartesian product of a fixed grid of sample points per
// parameter, in a stable order, so the same search space yields the same
// sequence every time. It produces single-strategy candidates; composite sizes
// in the space are ignored, which is a deliberate scope choice for this method.

import { createCandidateStrategy } from "./candidate-strategy-factory.js";
import { StrategyRegistry } from "./strategy-registry.js";
import type { StrategyParameterValue, StrategyParameters, ParameterSchema, ParameterDefinition } from "../domain/parameter-schema.js";
import type { CandidateStrategy, GeneratorProvenance } from "../domain/candidate-strategy.js";
import type {
  GenerateRequest,
  GeneratorDescriptor,
  ParameterRange,
  SearchSpace,
  StrategyGenerator,
  VersionedRef
} from "../domain/strategy-generator.js";

const DEFAULT_POINTS_PER_PARAMETER = 3;

const CONFIGURATION_SCHEMA: ParameterSchema = {
  properties: {
    pointsPerParameter: {
      type: "integer",
      label: "Points per parameter",
      description: "How many evenly spaced values each numeric parameter is sampled at.",
      minimum: 2,
      default: DEFAULT_POINTS_PER_PARAMETER
    }
  },
  required: []
};

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export class GridStrategyGenerator implements StrategyGenerator {
  readonly descriptor: GeneratorDescriptor = {
    id: "grid-search",
    version: "1.0.0",
    name: "Grid search",
    description: "Enumerates a deterministic grid of parameter combinations for each strategy.",
    configurationSchema: CONFIGURATION_SCHEMA
  };

  constructor(private readonly strategies: StrategyRegistry) {}

  generate(request: GenerateRequest): Iterable<CandidateStrategy> {
    const space = request.searchSpace;
    if (space.strategies.length === 0) {
      throw new Error("GENERATOR_SEARCH_SPACE: at least one strategy is required");
    }
    const points = this.readPointsPerParameter(request.configuration);
    const provenance: GeneratorProvenance = {
      id: this.descriptor.id,
      version: this.descriptor.version,
      configuration: request.configuration,
      seed: request.seed
    };

    return this.candidates(space, points, provenance);
  }

  private *candidates(
    space: SearchSpace,
    points: number,
    provenance: GeneratorProvenance
  ): Generator<CandidateStrategy> {
    const seen = new Set<string>();
    for (const ref of space.strategies) {
      for (const parameters of this.parameterGrid(ref, space, points)) {
        const candidate = createCandidateStrategy({
          specification: { kind: "single", id: ref.id, version: ref.version, parameters },
          generator: provenance
        });
        if (seen.has(candidate.contentHash)) {
          continue;
        }
        seen.add(candidate.contentHash);
        yield candidate;
      }
    }
  }

  // Every combination of the sampled points across a strategy's parameters, in a
  // stable order. Yields lazily via an odometer over the small per-parameter lists.
  private *parameterGrid(
    ref: VersionedRef,
    space: SearchSpace,
    points: number
  ): Generator<StrategyParameters> {
    const runnable = this.strategies.resolve(ref);
    const overrides = space.parameterRanges?.[ref.id];
    const fields = Object.entries(runnable.descriptor.parameterSchema.properties);
    const axes = fields.map(([field, definition]) =>
      this.sampleValues(field, definition, overrides?.[field], points)
    );

    const odometer = new Array<number>(axes.length).fill(0);
    const total = axes.reduce((product, axis) => product * axis.length, 1);
    for (let step = 0; step < total; step += 1) {
      const parameters: Record<string, StrategyParameterValue> = {};
      for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i]![0];
        const axis = axes[i]!;
        parameters[field] = axis[odometer[i]!]!;
      }
      // Relational constraints can invalidate an otherwise schema-valid point.
      // Skip that point while keeping the odometer order deterministic.
      try {
        runnable.validateParameters(parameters);
        yield parameters;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("STRATEGY_PARAMETER_RELATION:")) {
          throw error;
        }
      }
      for (let i = axes.length - 1; i >= 0; i -= 1) {
        const next = odometer[i]! + 1;
        if (next < axes[i]!.length) {
          odometer[i] = next;
          break;
        }
        odometer[i] = 0;
      }
    }
  }

  private sampleValues(
    field: string,
    definition: ParameterDefinition,
    override: ParameterRange | undefined,
    points: number
  ): readonly StrategyParameterValue[] {
    if (definition.type === "boolean") {
      return [false, true];
    }
    if (definition.type === "enum") {
      return [...definition.values];
    }
    const range = this.numericRange(override, definition);
    if (range === undefined) {
      if (definition.default === undefined) {
        throw new Error(
          `GENERATOR_PARAMETER_RANGE: ${field} has no usable range and no default to fall back on`
        );
      }
      return [definition.default as StrategyParameterValue];
    }
    return this.gridPoints(range, definition.type === "integer", points);
  }

  private numericRange(
    override: ParameterRange | undefined,
    definition: { readonly minimum?: number; readonly maximum?: number }
  ): ParameterRange | undefined {
    if (override !== undefined) {
      if (override.maximum < override.minimum) {
        throw new Error("GENERATOR_PARAMETER_RANGE: override maximum is below its minimum");
      }
      return override;
    }
    if (definition.minimum !== undefined && definition.maximum !== undefined) {
      return { minimum: definition.minimum, maximum: definition.maximum };
    }
    return undefined;
  }

  private gridPoints(range: ParameterRange, integer: boolean, points: number): readonly number[] {
    const values: number[] = [];
    for (let index = 0; index < points; index += 1) {
      const fraction = points === 1 ? 0 : index / (points - 1);
      const raw = range.minimum + fraction * (range.maximum - range.minimum);
      const value = integer ? Math.round(raw) : round4(raw);
      if (!values.includes(value)) {
        values.push(value);
      }
    }
    return values;
  }

  private readPointsPerParameter(configuration: Record<string, unknown>): number {
    const raw = configuration.pointsPerParameter;
    if (raw === undefined) {
      return DEFAULT_POINTS_PER_PARAMETER;
    }
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 2) {
      throw new Error("GENERATOR_CONFIGURATION: pointsPerParameter must be an integer of at least 2");
    }
    return raw;
  }
}
