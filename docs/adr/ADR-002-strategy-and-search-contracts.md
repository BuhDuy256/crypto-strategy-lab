# ADR-002 - Strategy Extensibility and Search Replaceability Contracts

**Status:** ACCEPTED
**Decision ID:** D-02, D-04
**Related Problem IDs:** P-1.1, P-1.2, P-1.5
**Related Scenario IDs:** QA-MOD-001, QA-MOD-002
**Original normative baseline:** [`architecture-baseline-v1.md`](../architecture/architecture-baseline-v1.md) v1; carried forward unchanged by [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

The assignment tests adding MACD and replacing Random Search without ripple changes. Strategies vary by logic/parameters; generators vary by proposal algorithm. Backtest, evaluation, ranking, provider, persistence, and UI behavior should not know concrete strategy/generator types.

## Decision

Define:

- a pure Strategy contract over a supplied analysis context;
- a versioned StrategyDescriptor and parameter schema;
- a startup-assembled descriptor/implementation registry;
- immutable CompositeStrategy definitions;
- versioned CombinationPolicy implementations;
- a StrategyGenerator port returning only immutable CandidateStrategy contracts.

Use additive compile-time/startup registration for v1. Do not load arbitrary user code at runtime. Experiment owns run lifecycle/limits; Strategy generator implementations own candidate proposal logic.

## Alternatives considered

- **Type switches/conditionals:** simple initially but every strategy/search addition edits closed-world engine logic.
- **Deep base-class inheritance:** shares implementation but couples lifecycle/infrastructure hooks and makes substitution brittle.
- **Arbitrary runtime plugin packages:** maximal drop-in flexibility but requires sandboxing, compatibility, trust, upgrade, and failure management not justified by the course MVP.
- **Embed generation in SearchCoordinator:** makes algorithm replacement modify lifecycle code.

## Why this option

The selected contracts isolate the two explicit axes of change with the least machinery and provide version/parameter metadata required for reproducibility.

## Consequences

- New strategies require implementation, descriptor, registration, and tests.
- New generators require one port implementation and binding/configuration.
- Registry/contract versions require compatibility discipline.
- Frontend catalogs come from descriptor data, not strategy-type conditionals.
- Runtime third-party code installation is out of scope.

## Risks

- A broad analysis context can become a hidden service locator.
- Registry metadata can diverge from implementation.
- Candidate hashes become unstable if serialization is not canonical.

## Evidence / validation

- PROOF-EXT-001 adds MACD and inspects unrelated diffs.
- PROOF-REPLACE-001 swaps a generator while keeping consumers unchanged.
- Contract tests validate parameter schema, deterministic identity/hash, signal semantics, and required inputs.

## Revisit triggers

- users must install untrusted strategies without redeploying;
- strategy capabilities cannot be expressed by the current context/descriptor contract;
- generator needs an interaction protocol beyond candidate production;
- contract/version migration cost exceeds the selected registry design.

## Affected architecture sections

Baseline: Strategy module, Responsibilities, Contracts, Allowed dependencies, Architectural invariants.
Proposal: sections 8 P-1, 10 QA-MOD-001/002, 12 D-02/D-04, 17 ARC-STRATEGY, 19.

## Supersedes / Superseded by

Supersedes: none.
Superseded by: none.
