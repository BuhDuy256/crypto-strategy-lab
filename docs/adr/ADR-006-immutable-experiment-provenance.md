# ADR-006 - Immutable Experiment Specification and Provenance

**Status:** ACCEPTED
**Decision ID:** D-08
**Related Problem IDs:** P-5.1, P-5.2, P-5.3, P-5.4, P-5.5, P-5.6
**Related Scenario IDs:** QA-REP-001, QA-ML-001
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

The source requires tracing Top #1 to the exact strategy version and frames the system as an experiment platform. Strategy version alone cannot reproduce results because data, parameters, combination/search policies, simulation assumptions, engine/build, metrics/ranking, model/input, and randomness can change.

## Decision

Create an ExperimentSpec in draft, validate it, then freeze it at run start with a canonical content hash. Every result and leaderboard entry references that immutable spec plus immutable/versioned artifacts. Never resolve a historical run from current defaults, latest strategy/model aliases, or mutable provider data.

The spec records every applicable field listed in the baseline reproducibility rules. DatasetRef uses an immutable manifest/snapshot/watermark. Strategy/model/engine/policy versions referenced by completed runs are append-only. Runtime/build provenance includes the Node.js runtime version, dependency-lock identity/hash, application build/commit, and worker build/commit. If a Python ML runtime is actually used, its runtime/dependency identity and model artifact are recorded conditionally; Python is not a mandatory provenance field. Reruns compare deterministic artifact hashes or a declared nondeterministic tolerance.

## Alternatives considered

- **Store strategy name/version only:** misses material inputs and cannot reproduce.
- **Snapshot selected configuration JSON without typed/versioned references:** better but allows missing fields and ambiguous semantics.
- **Full Event Sourcing:** captures transitions but does not itself guarantee complete input provenance and adds replay cost.
- **Immutable typed spec + artifact references:** selected, direct and sufficient.

## Why this option

It makes reproducibility an explicit data invariant rather than a reporting promise and keeps the Leaderboard explainable without adopting a full event-sourced architecture.

## Consequences

- Started specs cannot be edited; changes create a new experiment/version.
- Storage/retention must preserve referenced artifacts and metadata.
- Canonical serialization and content hashing are part of the contract.
- External models/data that cannot be recovered must be labeled accordingly; architecture cannot falsely guarantee reproducibility.

## Risks

- Missing a material field produces false reproducibility.
- Provider/model artifacts may be unavailable later despite stored metadata.
- Long-term artifact retention can be expensive.
- Code/build identifiers alone may not capture native/runtime nondeterminism.

## Evidence / validation

- PROOF-REP-001 resolves the complete checklist from Top #1 and reruns it.
- Schema tests reject starting an incomplete spec for its selected capabilities.
- Mutation tests verify referenced versions/specs cannot be overwritten.

## Revisit triggers

- new strategy/execution/model capability introduces a material input absent from the spec;
- retention policy cannot preserve required artifacts;
- regulatory/audit rules require stronger signing or event history;
- reproducibility proof exposes undeclared nondeterminism.

## Affected architecture sections

Baseline: Contracts, Data ownership, Persistence rules, Reproducibility rules.
Proposal: sections 8 P-5, 10 QA-REP-001, 19-21, 23 C11.

## Supersedes / Superseded by

Supersedes: none.
Superseded by: none.
