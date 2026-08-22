# 02 - Strategy and Composition

The strategy contract, the four MVP strategies, composite strategies with a
versioned combination policy, and the generator port that later lets the search
algorithm be replaced without touching anything downstream.

Read [`README.md`](README.md) first. Version scope is in [`VERSIONS.md`](VERSIONS.md);
statuses are in [`TRACKING.md`](TRACKING.md).

| Version | Slices |
|---|---|
| V1 | `STRAT-01`, `STRAT-02` |
| V2 | `STRAT-03`, `STRAT-04`, `STRAT-05`, `STRAT-08` |
| V3 | `STRAT-06`, `STRAT-07` |

V1 builds the contract and one strategy, because a backtest needs something to run.
V2 makes the extensibility claim real by adding three more and combining them. V3
adds the candidate and generator abstractions, which have no driver until something
generates candidates automatically.

## Why this area is the most constrained

Two of the assignment's central architecture questions land here:

- "How is a new strategy added, and which components change?"
- "How is the search algorithm replaced, and does the backtest engine change?"

Both are proved later by inspecting a diff, so the shape of these contracts matters
more than the cleverness of the strategies behind them. A single type-switch on
strategy kind anywhere in this area fails `PROOF-EXT-001` no matter how well the
strategies work.

## The rule that governs every slice here

A strategy is a pure function of a supplied context. It never reaches for data
itself. If a strategy needs something, it declares that something in its descriptor
as a required input and the caller supplies it.

---

# V1 slices

## STRAT-01 - Strategy contract, descriptor, registry, and annotation primitives

**Version:** V1 · **Priority:** REQ · **Effort:** M

**Outcome**
A framework-free `Strategy` contract, a normalized `Signal`, an `AnalysisContext`, a
versioned `StrategyDescriptor` with a parameter schema, a registry assembled at
startup, and a small set of generic visualization annotation primitives that
strategies emit and the chart later renders.

**Why this slice exists**
Everything else in this area and most of area 03 depends on these types. They are
also the exact surface `PROOF-EXT-001` inspects in V2.

The annotation primitives are here rather than in the frontend because the frozen
architecture forbids the frontend from computing indicators, and because a
strategy-specific rendering path would break the "add a strategy without touching
the frontend" claim on the first new strategy.

**Dependencies**
`SETUP-05`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `StrategyDescriptor` and `Strategy` definitions.
- [Baseline - Logical modules, ARC-STRATEGY](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): a strategy produces a normalized signal plus optional visualization annotations.
- [ADR-002 - Decision](../docs/adr/ADR-002-strategy-and-search-contracts.md): a pure strategy contract, a versioned descriptor and parameter schema, and a startup-assembled registry. No runtime loading of arbitrary code.
- Official project source sections 6, 12 and 41.

**Architecture constraints**
- `Strategy` maps a supplied context to a normalized signal plus optional
  annotations. It has no infrastructure access at all.
- The signal vocabulary is normalized and fixed: buy, sell, hold.
- The descriptor carries a stable identifier, a semantic version, a category and
  capabilities, a parameter schema, required inputs, and its implementation binding.
- Registration is additive at startup. No runtime loading of user-supplied code.
- ADR-002 names two risks to design against: a broad context that becomes a hidden
  service locator, and registry metadata that drifts from the implementation. Keep
  the context narrow, and derive catalog data from the descriptor rather than
  maintaining a second list.
- Nothing in `strategy/domain` imports NestJS, a database, a queue, or a provider.

**Annotation primitives**

Annotations are generic drawing instructions, never strategy-specific shapes. The
set is:

| Primitive | Carries | Example use |
|---|---|---|
| `line` | a named series of time and value points | a moving average |
| `band` | a named upper and lower series | Bollinger bands |
| `zone` | a price range over a time range | a support or resistance zone |
| `level` | one horizontal price with a label | a threshold or a pivot |
| `marker` | a point in time with a direction and label | a signal point |

A strategy emits these. The chart renders by primitive type and never branches on a
strategy identifier. An unrecognized primitive type is skipped, not an error, so a
strategy added later can never break the page.

**Expected change surface**
`strategy/domain` contracts, the annotation primitive types, the parameter schema
mechanism, the registry in `strategy/application`, registration wiring in
`StrategyModule`, and the exported surface in `strategy/index.ts`.

**Acceptance criteria**
1. `Strategy`, `Signal`, `AnalysisContext`, `StrategyDescriptor`, the registry, and
   the five annotation primitives exist.
2. The registry resolves a strategy identifier and version into a runnable instance,
   and rejects an unknown identifier or version with a clear error.
3. Parameters are validated against the descriptor's schema before a strategy runs,
   and an invalid parameter set is rejected with a message naming the field.
4. The context exposes only what a descriptor can declare as a required input.
   Adding a new context field requires a descriptor change, not a silent addition.
5. No `switch` or `if` on a strategy identifier exists anywhere outside the registry.
6. The annotation types are closed and generic; none of them names a strategy or an
   indicator.
7. The boundary test confirms `strategy/domain` has no infrastructure imports.
8. A test registers a throwaway fake strategy and runs it through the registry with
   no change to any other file.

**Validation**
Contract tests for registration, resolution, parameter validation, signal shape, and
annotation shape. Run the boundary test. The fake-strategy test in criterion 8 is
the rehearsal for `PROOF-EXT-001`.

**Out of scope**
Any real strategy, indicators, composition, generators, persistence, rendering.

**Proof relevance**
Directly enables `PROOF-EXT-001` in V2. The diff that proof inspects is measured
against the surface defined here.

---

## STRAT-02 - Indicator primitives and the first strategy

**Version:** V1 · **Priority:** REQ · **Effort:** M

**Outcome**
Reusable indicator calculations and one working `MAStrategy` registered through
`STRAT-01`, producing buy, sell, and hold signals from a candle series plus a `line`
annotation for its moving averages.

**Why this slice exists**
It proves the `STRAT-01` contract is usable, gives V1 something to backtest, and
sets the pattern that `STRAT-03` follows three more times in V2. Building one
strategy carefully is worth more than building four hastily.

**Dependencies**
`STRAT-01`.

**Authoritative references**
- Official project source section 7: moving average crossover, `fastPeriod` and `slowPeriod`, and the explicit rule that the strategy contains no Binance call, no database code, no chart code, and no notification code.
- [ADR-002](../docs/adr/ADR-002-strategy-and-search-contracts.md).

**Architecture constraints**
- Indicators are pure functions in `strategy/domain`. They take numbers and return
  numbers.
- `MAStrategy` holds moving average logic only.
- Warm-up handling is explicit: before enough candles exist for the slow period, the
  strategy returns hold rather than a guess.
- Any parameter (periods, price source) is declared in the descriptor's schema,
  never a hidden constant.

**Expected change surface**
An indicator module in `strategy/domain`, the `MAStrategy` implementation, its
descriptor, its registration, and tests.

**Acceptance criteria**
1. The moving average calculation matches hand-computed values on a small fixture.
2. A fast-over-slow upward crossover yields buy; a downward crossover yields sell;
   no crossover yields hold.
3. Before the slow period is satisfied the strategy returns hold, with no partial or
   undefined value.
4. Parameters come from the descriptor schema and are validated.
5. The strategy runs through the registry with no direct import from any other
   module.
6. It emits `line` annotations for the fast and slow averages, so `UI-05` draws them
   without recomputing anything.

**Validation**
Unit tests for the indicator and for each signal case, using fixed candle fixtures
rather than live data.

**Out of scope**
The other three strategies, composition, backtesting, chart drawing.

**Proof relevance**
Contributes to `PROOF-EXT-001` as the reference pattern a new strategy copies.

---

# V2 slices

## STRAT-03 - The remaining three MVP strategies

**Version:** V2 · **Priority:** REQ · **Effort:** M

**Outcome**
`RSIStrategy`, `BollingerBandsStrategy`, and `SupportResistanceStrategy` are
implemented, registered, and tested, following the `STRAT-02` pattern with no change
to the contract or registry.

**Why this slice exists**
The MVP requires at least four single strategies. Doing three at once is appropriate
because they share a proven pattern; the interesting work is each strategy's own
rules, not the wiring.

**Dependencies**
`STRAT-02`.

**Authoritative references**
- Official project source sections 8, 9 and 10: RSI with `period`, `buyThreshold`, `sellThreshold`; Bollinger Bands with upper, middle, and lower bands; support and resistance zones.
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants) item 1.

**Architecture constraints**
- Adding these three must change no file outside `strategy/`, other than
  registration. If it does, `STRAT-01` was wrong and that is a plan mismatch worth
  reporting.
- Support and resistance detection is algorithmic and its algorithm is versioned in
  the descriptor, because the requirements note that this zone definition depends on
  the algorithm chosen.
- Each strategy declares its own parameter schema. No shared mutable defaults.

**Expected change surface**
Three strategy implementations with their indicators, three descriptors, three
registrations, and tests. One shared registration list may be edited.

**Acceptance criteria**
1. Each of the three produces buy, sell, and hold on fixtures matching the rules in
   the official source.
2. Each has an explicit warm-up rule and returns hold before it is satisfied.
3. Each declares its parameters in its descriptor, including RSI thresholds and
   Bollinger period and deviation.
4. The support and resistance strategy records its zone-detection algorithm
   identifier and version in its descriptor.
5. The diff for this slice touches no file outside `strategy/` except the
   registration list and tests.
6. All four strategies appear in the registry with distinct identifiers and versions.
7. Each emits appropriate annotation primitives: `band` for Bollinger, `zone` for
   support and resistance, `level` for RSI thresholds.

**Validation**
Unit tests per strategy on fixed fixtures. Inspect the diff and confirm criterion 5
before finishing.

**Out of scope**
MACD, which is deliberately saved for `PROOF-EXT-001`. SMC, Wyckoff, sentiment
strategies, composition.

**Proof relevance**
Contributes to `PROOF-EXT-001`: this is the "start from the four MVP strategies"
starting state that proof requires.

---

## STRAT-04 - Composite strategy and versioned combination policy

**Version:** V2 · **Priority:** REQ · **Effort:** M

**Outcome**
An immutable `CompositeStrategy` combines ordered component strategies with their
versions and parameters, and a versioned `CombinationPolicy` turns their individual
signals into one decision. Majority vote and weighted score are both available.

**Why this slice exists**
The official source calls composite strategy "the central part of the problem". The
combination rule is also a reproducibility input, which is why it is versioned
rather than being a helper function.

**Dependencies**
`STRAT-03`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `CompositeStrategy` is ordered strategy references, versions and parameters, plus a combination policy identifier, version, and configuration.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) items 1 and 2.
- [ADR-002](../docs/adr/ADR-002-strategy-and-search-contracts.md): immutable composite definitions and versioned combination policies independent of the component strategies.
- Official project source sections 13 and 14: majority vote, and weighted combination with buy as `+1`, hold as `0`, sell as `-1`, plus a score threshold.

**Architecture constraints**
- A composite definition is immutable once created.
- The combination policy is independent of which strategies it combines. It sees
  signals and weights, never strategy identifiers, and never special-cases one.
- Policy identifier, version, and configuration are part of provenance.
- Component order is part of the definition, because it affects the canonical hash
  even where it does not affect the outcome.
- The threshold in the weighted policy is configuration, not a constant.
- A composite passes through the annotations of its components unchanged, so the
  chart can draw every component's overlay.

**Expected change surface**
A composite definition type, a combination policy port with two implementations,
registration of the policies, annotation merging, and tests.

**Acceptance criteria**
1. A composite of two or more strategies produces one combined signal per bar.
2. Majority vote resolves the official source's examples correctly, including its
   tie cases, and its tie rule is documented.
3. The weighted policy reproduces the official source's worked example: weights
   `0.2, 0.3, 0.5` with signals buy, sell, buy give a score of `0.4`, and a threshold
   of `0.3` yields buy.
4. Weights and threshold come from the policy configuration, not from code.
5. Each policy has an identifier and a semantic version, both recorded on the
   composite definition.
6. Adding a third policy requires no change to any strategy or to the composite type.
7. A composite definition cannot be mutated after creation.
8. Component annotations are merged and tagged by component so the chart can show
   which strategy drew what.

**Validation**
Unit tests for both policies including the two worked examples from the official
source, plus a test that adds a throwaway third policy without touching existing
files.

**Out of scope**
Persisting composites, which is `STRAT-08`. Automatic generation, which is
`STRAT-07`.

**Proof relevance**
Contributes to `PROOF-REP-001` items 1 and 2.

---

## STRAT-05 - Strategy catalog query and endpoint

**Version:** V2 · **Priority:** REQ · **Effort:** S

**Outcome**
An endpoint returns the registry's descriptors so the Strategy Engine page can list
available strategies, their categories, and their parameter schemas without the
frontend knowing any strategy name in advance.

**Why this slice exists**
ADR-002 states that frontend catalogs come from descriptor data, not from
conditionals on strategy type. This is what lets `PROOF-EXT-001` claim "no frontend
core change" when MACD is added.

**Dependencies**
`STRAT-03`, `SETUP-06`.

**Authoritative references**
- [ADR-002 - Consequences](../docs/adr/ADR-002-strategy-and-search-contracts.md): frontend catalogs come from descriptor data.
- [Baseline - Logical modules, ARC-API](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts).
- Sample interface image showing the single-strategy list with name, description, and category.

**Architecture constraints**
- The response is generated from registry descriptors. There is no second
  hand-written list anywhere.
- The frontend contains no strategy name, no icon map keyed by strategy identifier,
  and no parameter list that would need editing when a strategy is added.
- The parameter schema travels to the client so forms can be rendered generically.

**Expected change surface**
A catalog query port in `strategy/application`, a controller and DTO in `ApiModule`,
the catalog type in `packages/api-contracts`, and an API client method.

**Acceptance criteria**
1. The endpoint lists all registered strategies with identifier, version, name,
   description, category, capabilities, and parameter schema.
2. Registering a new strategy makes it appear with no change to the controller, the
   DTO, or the frontend.
3. The parameter schema is expressed in a form the frontend can render generically,
   including type, range, and default per parameter.
4. A test proves criterion 2 by registering a fake strategy and asserting it appears.

**Validation**
Endpoint tests, including the fake-strategy test. Confirm no strategy identifier
appears as a literal in `apps/web`.

**Out of scope**
The Strategy Engine page, composite creation, backtesting.

**Proof relevance**
Directly required by `PROOF-EXT-001`, which requires the new strategy to appear
through registry metadata rather than a type-switch.

---

## STRAT-08 - Composite definition persistence and endpoint

**Version:** V2 · **Priority:** REQ · **Effort:** S

**Outcome**
A composite definition built in the interface can be validated, saved immutably, and
referenced later by identifier when starting a backtest.

**Why this slice exists**
The Strategy Engine page needs to save what a person builds, and the Backtest page
needs to reference it. The earlier plan gave the page a save button with no backend
slice owning the capability.

**Dependencies**
`STRAT-04`.

**Authoritative references**
- [Baseline - Data ownership](../docs/architecture/architecture-baseline.md#data-ownership): Strategy owns descriptors, versions, schemas, composite definitions, and combination policy definitions.
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): versions and artefacts referenced by completed results are append-only.

**Architecture constraints**
- Strategy owns the composite table. No other module writes it.
- A saved composite is append-only. Editing one creates a new definition with a new
  identifier, because a completed result may reference the old one.
- Validation happens before saving: every component must resolve in the registry,
  every parameter must satisfy its schema, and the policy must exist.
- The stored definition pins component versions. It never stores "latest".
- The composite evaluation endpoint computes the combined signal on the server, so
  the page never calculates it.

**Expected change surface**
A composite table migration, save and load in `strategy/application`, a controller
with save, load, list, and evaluate endpoints, contract types, and API client
methods.

**Acceptance criteria**
1. A valid composite is saved and returns a stable identifier.
2. An invalid composite is rejected with a message naming the offending component or
   parameter.
3. A saved composite cannot be modified; a save with changes produces a new
   identifier.
4. Stored component references carry explicit versions, never an alias.
5. Listing returns saved composites with enough detail to display them.
6. The evaluate endpoint returns the combined signal for a given composite and data
   window, computed on the server.

**Validation**
Integration tests for save, validation failure, immutability, list, and evaluate.

**Out of scope**
The page itself, which is `UI-02`. Generated composites, which are `STRAT-07`.

**Proof relevance**
Contributes to `PROOF-REP-001` item 1.

---

# V3 slices

## STRAT-06 - Candidate strategy contract and canonical hashing

**Version:** V3 · **Priority:** REQ · **Effort:** M

**Outcome**
A `CandidateStrategy` type carries a complete immutable strategy or composite
specification plus generator provenance and a stable content hash. The same
specification always hashes to the same value.

**Why this slice exists**
This is the contract that separates search from everything downstream. It arrives in
V3 because before automated generation there is no "candidate" - a person picks a
strategy directly and `EXP-01` records that choice.

ADR-002 names unstable candidate hashes as a risk, so canonical serialization is
part of the contract rather than an afterthought.

**Dependencies**
`STRAT-04`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `CandidateStrategy` is an immutable complete strategy or composition specification plus generator provenance and a content hash.
- [ADR-002 - Risks](../docs/adr/ADR-002-strategy-and-search-contracts.md): candidate hashes become unstable if serialization is not canonical.
- Official project source section 42: downstream components receive only a candidate and do not know how it was produced.

**Architecture constraints**
- A candidate is complete. Resolving it later must never require a current default
  or a "latest version" alias.
- Serialization is canonical: stable key order, stable number formatting, stable
  handling of absent optional fields.
- Generator provenance (identifier, version, configuration, seed) travels with the
  candidate.
- Downstream code treats the generator as opaque. Nothing outside Strategy may branch
  on which generator produced a candidate.
- The canonical hasher is the one `MKT-10` and `EXP-01` already use. Do not write a
  second one.

**Expected change surface**
The candidate type, extension of the canonical serializer in `platform`, and tests.

**Acceptance criteria**
1. Hashing the same candidate twice in the same process gives the same value.
2. Hashing an equivalent candidate rebuilt from its serialized form gives the same
   value.
3. Reordering unordered fields does not change the hash; changing component order
   does.
4. Changing any parameter, version, policy, or seed changes the hash.
5. A candidate cannot be mutated after creation.
6. The candidate records generator identifier, version, configuration, and seed.
7. The hash matches when computed in the API process and in the runner process.

**Validation**
Hash stability tests, including a round trip through serialization and a
cross-process check.

**Out of scope**
Any generator implementation, persistence, dispatch.

**Proof relevance**
Directly required by `PROOF-REPLACE-001` and by `PROOF-REP-001` item 3.

---

## STRAT-07 - Generator port, random search generator, and generator catalog

**Version:** V3 · **Priority:** REQ · **Effort:** M

**Outcome**
A `StrategyGenerator` port, a `RandomStrategyGenerator` producing valid seeded
reproducible candidates from a declared search space, and a catalog endpoint listing
registered generators so the Discovery page can offer them without naming any.

**Why this slice exists**
Random search is the MVP's required search method, and this port is what
`PROOF-REPLACE-001` swaps. The catalog endpoint is here because the Discovery page
otherwise needs a hard-coded generator list, which would break the replaceability
claim at the interface layer.

**Dependencies**
`STRAT-06`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `StrategyGenerator` takes a versioned and configured request and returns a `CandidateStrategy`; the implementation is opaque downstream.
- [ADR-002](../docs/adr/ADR-002-strategy-and-search-contracts.md): a new generator requires one port implementation plus binding and configuration.
- Official project source sections 15, 16 and 42.

**Architecture constraints**
- The generator returns candidates only. It does not decide how many to make, when
  to stop, or what to do with them. That is Experiment's job.
- Generation is seeded and reproducible: the same seed, search space, and
  configuration produce the same candidate sequence.
- The search space is explicit configuration: which strategies, which parameter
  ranges, which composite sizes, which policies.
- Adding a second generator later must require no change outside Strategy plus a
  binding.
- The catalog is generated from registered generators, exactly as `STRAT-05` does for
  strategies.

**Expected change surface**
The generator port, the random generator, a search space configuration type, a
seeded random source in `platform`, registration, a catalog query and endpoint, and
tests.

**Acceptance criteria**
1. The generator produces candidates that pass parameter validation every time.
2. The same seed and configuration produce an identical candidate sequence, proved
   across two separate process runs.
3. Different seeds produce different sequences.
4. Composite size and allowed strategies honour the configured search space.
5. Duplicate candidates are either avoided or reported, and the chosen behaviour is
   documented, because duplicates waste runner time.
6. The catalog endpoint lists registered generators with identifier, version, name,
   description, and configuration schema.
7. A throwaway second generator can be registered, appears in the catalog, and can be
   selected by configuration with no change to the port, the candidate type, any
   consumer, or `apps/web`.

**Validation**
Determinism tests across two process runs, search space compliance tests, catalog
tests, and the throwaway-generator test in criterion 7. That last test is the
rehearsal for `PROOF-REPLACE-001`.

**Out of scope**
Domain-guided, genetic, Bayesian, or model-driven generators. Those are extensions,
and domain-guided search is the subject of `PROOF-REPLACE-001` itself.

**Proof relevance**
Directly enables `PROOF-REPLACE-001`.
