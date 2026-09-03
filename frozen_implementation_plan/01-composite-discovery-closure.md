# Functional closure: composite candidates in automated discovery

`FIN-01` is the backend change. `FIN-02` is the minimum UI that makes it
reachable. Read [README.md](README.md) first for the closed requirement decision
that governs both.

---

## FIN-01 - Composite candidate execution path

**Status:** NOT STARTED · **Priority:** MUST · **Risk:** highest in the release
· **Reasoning level:** XHigh (the only task that earns it)

### Problem

`SearchCoordinator.submit` rejects any candidate whose specification kind is not
`single`, with `SEARCH_COMPOSITE_UNSUPPORTED` (`search-coordinator.ts:433`). The
rejection exists because the derived experiment specification the coordinator
builds has no field able to carry a composite definition.

Two facts make this a real design question rather than a deleted `if`:

**1. Resolution.** `ExperimentDraftContent.strategy` is a reference,
`{ id, version, parameters }`. Downstream resolves it from the strategy registry,
falling back to `CompositeStrategyService`, which loads a *saved* composite from
the database. A generated composite has no such record and must not be given one.

**2. Identity collapse.** Every generated composite from
`RandomStrategyGenerator` currently carries the same identity: id
`generated-composite`, version `1.0.0`, empty parameters. If the derived
specification contained only that reference, two structurally different
composites would produce byte-identical content, therefore the same canonical
hash, therefore the same run. Distinct candidates would silently collapse into
one. Removing the guard alone does not produce a working system; it produces a
reproducibility defect that is harder to see than a thrown error.

The composite definition must therefore travel **inside** the frozen
specification content, not beside it.

### Why this matters

This is the one required inconsistency between the official requirements and the
implementation under the accepted reading. It is the difference between a search
over six single strategies and a search over a combinatorial space, which is the
stated reason the search module exists.

### Required outcome

```text
generation -> candidate ledger -> derived frozen specification
  -> run claimed by the runner -> composite resolved -> backtested
    -> evaluated -> ranked -> Top-K leaderboard -> readable via the API
```

with these properties:

- two structurally different composite candidates produce different content
  hashes and different runs;
- no generated composite is written to the saved-composite store;
- single-strategy discovery behaves exactly as before.

### Authoritative evidence

Read these and nothing more. This is the whole startup context for the task:

- `search-coordinator.ts`, the `submit` method around line 422.
- `experiment-specification.ts`, `ExperimentDraftContent` and
  `FrozenExperimentContent`.
- `experiment-specification-service.ts`, `assertDraft` and `freeze`. `freeze` is
  where the descriptor is resolved and the canonical hash is taken.
- `worker-thread-backtest-computation.ts`, which already supplies
  `compositeDefinition` to the worker.
- `backtest-computation.worker.ts`, which already registers a composite execution
  strategy from that definition.
- `backtest-runner.module.ts`, the descriptor `resolve` callback.
- `composite-strategy.ts` for `CompositeStrategyDefinition`.

ADR-006 (immutable specification, canonical hash) and ADR-002 (candidate and
generator contracts) are the governing decisions. You do not need to re-read them
unless something below appears to conflict with them.

### Dependencies

None. This is the first task.

### Expected change surface

Backend only. No frontend change, no contract package change.

| Area | Expected change |
|---|---|
| `experiment-specification.ts` | Add an optional inline composite definition to the draft content. Present exactly when `strategy` names a composite that is not resolvable from the registry or the saved store. |
| `experiment-specification-service.ts` | Validate the new field in `assertDraft`. In `freeze`, resolve the descriptor from the inline definition when present instead of loading a saved composite. |
| `search-coordinator.ts` | Replace the throw with derived-content construction for the composite case. |
| `worker-thread-backtest-computation.ts` | Prefer the inline definition carried by the specification over a saved-store lookup. |
| `backtest-runner.module.ts` | Same preference in the descriptor `resolve` callback. |
| Database | None expected. Specification content is stored as JSON. If a migration appears necessary, stop and report it. |

### Design guidance

**Prefer the smallest realization.** Including the inline
`CompositeStrategyDefinition` in the canonical frozen content is by itself enough
to make two different definitions hash differently, because the definition is
part of the hashed content. That solves the identity-collapse problem directly.

**Do not introduce new identity or version semantics** — no content-derived
composite identifier, no synthesized version — unless live code proves the
smaller realization actually fails. If the inline definition works, that is the
implementation. Do not build a new conceptual model to make the code look
cleaner.

The reference and the definition must not be able to disagree. The cheapest
guarantee is a validation in `assertDraft` that rejects content where the two are
inconsistent, not a new derivation scheme.

Leave one short code comment saying why the field exists: to keep a generated
composite out of the saved-composite store.

### Architecture constraints

- The frozen specification stays immutable and completely self-describing. An
  inline definition strengthens ADR-006 rather than weakening it, because the run
  no longer depends on a saved record still existing.
- Nothing downstream of the candidate contract may branch on the generator, the
  seed, or how a candidate was produced.
- No generated composite is persisted through `CompositeStrategyService`.
- The `BacktestExecutor` seam is unchanged. This makes an existing path
  reachable; it does not add one.
- No new ADR. If that turns out to be false, stop and follow the architecture
  deviation procedure in `AGENTS.md`.

### Acceptance criteria

Three invariants. These are the whole bar.

**A. Distinct identity.** Two structurally different generated composites produce
different frozen specification content hashes and therefore different runs.

**B. End-to-end execution without persistence.** A generated composite executes
through the discovery pipeline, produces a result, a ranking, and a leaderboard
entry, and creates no row in the saved-composite store.

**C. No single-strategy regression.** Existing single-candidate discovery still
works.

**D. No branch on provenance.** The diff introduces no branch on generator id,
generator implementation type, random search specifically, or how a candidate was
produced. `SearchCoordinator` may branch on the *shape* of the candidate
specification where necessary; it may not branch on *who produced it*. Verified by
diff inspection or one cheap targeted search, not by re-running a proof.

One further behavioral requirement, verified by inspection rather than by a test:
a composite whose components include a sentiment-requiring strategy must fail
with a clear error, not silently produce a wrong result. Discovery already cannot
supply a sentiment input, and freezing such a specification is already rejected.
Confirm that the rejection still happens; do not make sentiment work in
discovery.

### Targeted validation

This is the highest-risk change in the release and may not proceed without
automated validation. But the invariants do not each need their own large test.
Prefer the cheapest seam that gives high confidence:

| Invariant | How it is established |
|---|---|
| **A** distinct identity | One small automated test at the specification-service seam: freeze two different inline composite definitions, assert different canonical content. |
| **B** end-to-end, no persistence | Split. One small automated test at the `SearchCoordinator` / specification seam proving a generated composite is accepted and its inline definition is preserved into the frozen content. Then reuse the existing execution and result tests for downstream behavior, which they already cover. Then one small manual local run confirming generated composite -> result -> leaderboard entry, with no new saved-composite row. |
| **C** no single-strategy regression | Re-run the existing search-coordinator and specification-service test files. They already exist and already cover it. |
| **D** no branch on provenance | Read the diff. Or one targeted search for generator identifiers in the changed files. No test. |

**Do not write one large new integration test to prove invariant B.** Add a
larger test only if live code proves there is no cheaper high-confidence seam,
and say so if you conclude that.

Also typecheck the backend package.

Do not open unrelated test files. Do not add coverage beyond these invariants. Do
not run the repository-wide suite here.

### Explicit non-goals

- No new generator.
- No change to ranking, metrics, or the leaderboard projection.
- No sentiment-bearing composite in the demo path.
- No persistence of generated composites as reusable strategies.
- No performance work.

### Documentation and proof impact

- No ADR, baseline, or proof-definition change expected.
- `PROOF-REP-001` is re-run in `FIN-06` against a generated composite, because
  this task changes frozen specification content. That is the only proof this
  release materially affects.
- **`PROOF-REPLACE-001` is not re-run.** Invariant D is the cheap guard on
  generator replaceability. Escalate to the proof only if the implementation
  appears to threaten that property.
- `VERSIONS.md` and `TRACKING.md` claims are handled in `FIN-05`.

### Stop-loss

**At about two hours, stop and answer four questions in writing:**

1. Does the inline composite definition reach the draft and then the frozen
   specification?
2. Do two structurally different definitions produce distinct canonical content?
3. Can the runner resolve the inline definition without a saved-store lookup?
4. What uncertainty remains, named specifically?

Three yeses and a bounded remaining uncertainty means continue. Anything else
means the risk is not yet under control.

**At about three hours, make a hard release decision.** Finish only if the
remaining work is bounded and you can name it. Otherwise restore the guard, leave
the frontend on single strategies, and document the limitation in `FIN-05`.

Do not spend four or more hours merely understanding this task while the rest of
the release remains untouched. The cost of a documented limitation is one
paragraph and one honest sentence during the defense. The cost of an unfinished
day is the whole release.

### What failure of this task would imply

If the existing contracts genuinely cannot carry a generated composite, the
implication is larger than this release: the candidate abstraction would be
single-strategy in disguise. That is an architecture finding and must be reported
to the owner, not worked around. Verification suggests it will not happen, which
is why this task is scheduled first rather than hedged.

If the task is merely unfinished at the end of the day, apply the stop-loss
policy in `README.md`: restore the guard, leave the frontend on single
strategies, and record the limitation in `FIN-05`. A half-landed version that
throws during the demo is strictly worse than a clean documented limitation.

---

## FIN-02 - Minimal composite discovery UI exposure

**Status:** NOT STARTED · **Priority:** MUST (minimal form) · **Reasoning
level:** High

### Problem

`DiscoveryPage.tsx:227` hard-codes `compositeSizes: [1]` and `policies: []`. Even
with `FIN-01` complete, discovery would keep searching single strategies only.

`random-strategy-generator.ts:220` rejects a search space with `size > 1` and an
empty policy list, so both constants must change together.

### Required outcome

The examiner can trigger automated composite discovery from the UI and watch a
generated composite complete the pipeline:

```text
Discovery -> choose a composite size greater than one -> send a valid search space
  -> run -> a composite reaches the leaderboard
    -> the entry is understandable enough to identify its components and policy
```

Nothing in the frontend decides, computes, or ranks anything.

### The minimal realization

Two constants change. That is the release requirement.

| Constant | Minimal replacement |
|---|---|
| `compositeSizes: [1]` | An operator control for composite size. Simplest usable form is enough — a small set of checkboxes or a number input validated to be at least one. |
| `policies: []` | One known-good policy sent as a literal: `[{ id: "majority-vote", version: "1.0.0" }]`, verified against `built-in-combination-policy-registry.ts` and `combination-policy.ts:34`. |

**The combination policy catalog endpoint is DROPPED for this release.** Not
stretch: dropped. It is not required for the behavior above. Building it would
add a backend endpoint, a contract type and runtime guard, a web client function,
and a test, all on release day, to make one integration sentence perfectly true.
Strategy extensibility and generator replaceability are the architecture claims
that matter, and both are already proven. If time remains after freeze readiness,
spend it rehearsing the defense, not building this.

Consequence to record in `FIN-05`, in these terms and not looser ones: the
backend architecture does support versioned combination policy components; only
the frontend's policy options are not metadata-driven, because no catalog
endpoint exists. That is a UI integration limitation, not a domain architecture
limitation.

**Do not refactor `StrategyEnginePage` to use a catalog.** Its policy literals
already work and it is not on the critical path.

### Dependencies

`FIN-01`. Offering composite sizes before the backend can execute a composite
candidate produces an interface that throws on use.

### Expected change surface

`apps/web/src/pages/DiscoveryPage.tsx` only.

The leaderboard entry display already handles the composite case
(`DiscoveryPage.tsx:89-92` renders the composite name). Extend it to show
components and policy only if the existing label is genuinely not enough to
identify the composite in the room. Judge that after seeing a real entry.

### Architecture constraints

- No business logic in the frontend. The page selects and displays.
- Composite sizes and policies are search-space configuration sent to the
  backend, not client-side filtering of results.
- Do not add search-method options the backend does not have. An option that
  cannot run is a false claim rendered in a dropdown.

### Acceptance criteria

1. A discovery run started with a composite size greater than one produces
   composite candidates, and at least one reaches the leaderboard.
2. Selecting only size one reproduces the previous behavior.
3. A composite leaderboard entry is identifiable as a composite.
4. Nothing in the changed frontend computes a metric, a score, or a rank.

### Targeted validation

- Typecheck the web package.
- Run `DiscoveryPage.test.tsx` only if the request shape change breaks it; update
  it only where the shape legitimately moved.
- One manual end-to-end discovery run against a locally running backend.

Do not add UI or controller test coverage. Do not run the repository-wide suite
here.

**Functional checkpoint.** That manual run is the release's functional
checkpoint. A composite must reach the leaderboard. **If it does not, do not
begin `FIN-03`.** Presentation work on a screen whose central behavior is broken
is the worst available use of the remaining day; go back to `FIN-01` or invoke
its stop-loss.

### Explicit non-goals

- No genetic, Bayesian, or other search method.
- No source configuration, account, or settings interface.
- No Discovery layout redesign. That is `FIN-03`.
- No editing of a generated composite into a saved strategy.

### What failure of this task would imply

The backend would be correct and the system would look unchanged. The demo would
have to claim composite discovery works without showing it, which is the weakest
possible position in a defense. If time runs out here, ship the composite-size
control with the hard-coded policy rather than nothing.
