// Builds an immutable CandidateStrategy and computes its stable content hash.
//
// The hash reuses the shared canonical serializer in platform (the same one
// MKT-10 and EXP-01 use); this module does not introduce a second hasher.
// Canonical serialization sorts object keys, so the insertion order of
// unordered fields never affects the hash, while arrays such as the component
// list keep their order and therefore do affect it.

import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type {
  CandidateStrategy,
  CandidateStrategySpecification,
  GeneratorProvenance
} from "../domain/candidate-strategy.js";
import type {
  CombinationPolicyReference,
  ComponentStrategyReference,
  CompositeStrategyDefinition
} from "../domain/composite-strategy.js";

export interface CreateCandidateInput {
  readonly specification: CandidateStrategySpecification;
  readonly generator: GeneratorProvenance;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function assertPresent(field: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    throw new Error(`CANDIDATE_FIELD_REQUIRED: ${field}`);
  }
}

function assertExplicitVersion(field: string, version: unknown): void {
  if (typeof version !== "string" || version === "latest" || !VERSION_PATTERN.test(version)) {
    throw new Error(`CANDIDATE_VERSION: ${field} must be an explicit semantic version`);
  }
}

function assertParameters(field: string, parameters: unknown): void {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error(`CANDIDATE_PARAMETERS: ${field} must be a parameter object`);
  }
}

function assertConfiguration(field: string, configuration: unknown): void {
  if (typeof configuration !== "object" || configuration === null || Array.isArray(configuration)) {
    throw new Error(`CANDIDATE_CONFIGURATION: ${field} must be a configuration object`);
  }
}

// Recursively freeze a value so a candidate cannot be mutated after creation.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value as Record<string, unknown>)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }
  return value;
}

function componentContent(component: ComponentStrategyReference, field: string): ComponentStrategyReference {
  assertPresent(`${field}.id`, component.id);
  assertExplicitVersion(`${field}.version`, component.version);
  assertParameters(`${field}.parameters`, component.parameters);
  return { id: component.id, version: component.version, parameters: component.parameters };
}

function policyContent(policy: CombinationPolicyReference): CombinationPolicyReference {
  assertPresent("specification.composite.policy.id", policy.id);
  assertExplicitVersion("specification.composite.policy.version", policy.version);
  assertConfiguration("specification.composite.policy.configuration", policy.configuration);
  return { id: policy.id, version: policy.version, configuration: policy.configuration };
}

function compositeContent(composite: CompositeStrategyDefinition): CompositeStrategyDefinition {
  assertPresent("specification.composite.id", composite.id);
  assertExplicitVersion("specification.composite.version", composite.version);
  assertPresent("specification.composite.name", composite.name);
  assertPresent("specification.composite.description", composite.description);
  if (!Array.isArray(composite.components) || composite.components.length === 0) {
    throw new Error("CANDIDATE_COMPOSITE: specification.composite.components must be a non-empty list");
  }
  return {
    id: composite.id,
    version: composite.version,
    name: composite.name,
    description: composite.description,
    components: composite.components.map((component, index) =>
      componentContent(component, `specification.composite.components[${index}]`)
    ),
    policy: policyContent(composite.policy)
  };
}

// Build the exact structure that gets hashed. Only known fields are copied, so
// no undefined optional field ever reaches the serializer.
function specificationContent(specification: CandidateStrategySpecification): CandidateStrategySpecification {
  if (specification.kind === "single") {
    assertPresent("specification.id", specification.id);
    assertExplicitVersion("specification.version", specification.version);
    assertParameters("specification.parameters", specification.parameters);
    return {
      kind: "single",
      id: specification.id,
      version: specification.version,
      parameters: specification.parameters
    };
  }
  return { kind: "composite", composite: compositeContent(specification.composite) };
}

function generatorContent(generator: GeneratorProvenance): GeneratorProvenance {
  assertPresent("generator.id", generator.id);
  assertExplicitVersion("generator.version", generator.version);
  assertConfiguration("generator.configuration", generator.configuration);
  const seed = generator.seed;
  const validSeed =
    (typeof seed === "string" && seed !== "") || (typeof seed === "number" && Number.isFinite(seed));
  if (!validSeed) {
    throw new Error("CANDIDATE_GENERATOR: generator.seed must be a non-empty string or a finite number");
  }
  return { id: generator.id, version: generator.version, configuration: generator.configuration, seed };
}

export function createCandidateStrategy(input: CreateCandidateInput): CandidateStrategy {
  // Build the validated, known-fields-only content, then deep clone it so the
  // stored graph shares no reference with the caller's input. This does two
  // things: freezing the candidate never freezes an object the caller still
  // holds, and the exact same graph is both hashed and stored, so the stored
  // content and its hash can never drift apart.
  const canonical = structuredClone({
    schemaVersion: "v1" as const,
    specification: specificationContent(input.specification),
    generator: generatorContent(input.generator)
  });
  const contentHash = canonicalSha256(canonical);
  const candidate: CandidateStrategy = {
    schemaVersion: canonical.schemaVersion,
    specification: canonical.specification,
    generator: canonical.generator,
    contentHash
  };
  return deepFreeze(candidate);
}
