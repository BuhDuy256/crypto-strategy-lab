# NEXT_PROMPT.md — Architecture Review Patch & Technology Realization Update

> **Execution purpose**
>
> The architecture bootstrap is already complete and the current architecture is **FROZEN v1**.
>
> This prompt does **not** authorize a full architecture redesign and does **not** authorize application coding.
>
> It authorizes a narrowly scoped architecture review to:
>
> 1. apply the review findings below;
> 2. replace the current Python/FastAPI/Celery technology realization with a Node.js/TypeScript/NestJS/BullMQ realization;
> 3. clarify the durable integration-event path after the transactional outbox;
> 4. distinguish `FROZEN` architecture from `PROVEN` architecture;
> 5. remove one overly rigid transaction wording;
> 6. update all affected proposal/baseline/ADR/governance references consistently;
> 7. freeze a new baseline revision;
> 8. stop before application implementation.

---

# 0. Current architecture status

The existing architecture reasoning is considered valid and should be preserved.

Do **not** restart the reasoning process from zero.

The following are already accepted unless directly affected by this patch:

```text
Problem Tree
ASRs / Quality Attribute Scenarios
Modular Monolith with selectively separated process roles
Market Data bounded/module boundary
Strategy bounded/module boundary
Experiment bounded/module boundary
News Intelligence bounded/module boundary
Strategy contract + registry
StrategyGenerator replaceability
Provider adapters + normalized contracts
Asynchronous experiment processing
Transactional outbox
Immutable ExperimentSpec / provenance
Derived leaderboard projection
Realtime snapshot + live notification model
News/Sentiment logical isolation
Architecture proof plan
```

The architecture reasoning chain is already materially strong and must remain:

```text
Problem
  ↓
Architecture Problem
  ↓
Driver / ASR
  ↓
Scenario
  ↓
Forces
  ↓
Candidates
  ↓
Trade-off
  ↓
Decision
  ↓
Architecture
  ↓
Proof
```

Preserve this structure.

---

# 1. Review conclusion

The current output is mostly accepted.

The review found:

```text
Problem decomposition                 GOOD
Problem → Decision traceability       GOOD
Requirement vs assumption separation GOOD
Alternative/trade-off reasoning       GOOD
Module ownership                      GOOD
Reproducibility                       STRONG
Architecture proof planning           STRONG
Technology realization reasoning      NEEDS PATCH
Durable event transport semantics     NEEDS PATCH
Frozen vs proven status               NEEDS CLARIFICATION
Result transaction wording            NEEDS FLEXIBILITY
```

Do not redesign areas that are already strong.

---

# 2. Explicit technology decision from the owner

The project owner prefers the Node.js ecosystem.

The current Python/FastAPI choice was reviewed and there is no architecture problem that requires FastAPI specifically.

The presence of Machine Learning / sentiment analysis is **not** sufficient justification to force the whole backend into Python.

The approved direction is now:

```text
Frontend
React + TypeScript

Core backend
Node.js + TypeScript
NestJS

HTTP
NestJS Controllers

Realtime
NestJS WebSocket Gateway

Durable state
PostgreSQL

Async job processing
BullMQ + Redis

Backtest workers
Node.js / TypeScript workers initially

Durable integration delivery
PostgreSQL Transactional Outbox
  ↓
BullMQ durable delivery
  ↓
Idempotent consumer

Ephemeral live/UI fan-out
Redis Pub/Sub
  ↓
NestJS WebSocket Gateway

Sentiment capability
SentimentAnalyzer port
  ↓
replaceable implementation

ML runtime
Python is allowed only behind the SentimentAnalyzer/model boundary
when the selected model/library actually requires Python.

Local/demo packaging
Docker Compose-style topology
```

---

# 3. Why NestJS is selected over Express/FastAPI

Document the reasoning accurately.

Do **not** claim:

```text
NestJS is faster than Express.
NestJS is more enterprise, therefore better.
FastAPI cannot do the architecture.
```

Those are not the reasons.

The selection is based on architecture fit.

## 3.1 Architecture problem

The frozen architecture requires explicit logical boundaries between:

```text
API / Presentation
Market Data
Strategy
Experiment
News Intelligence
```

and requires controlled dependency directions, public contracts/ports, replaceable adapters, and minimal cross-module coupling.

## 3.2 Candidate realization

Credible candidates include:

```text
A. Express + TypeScript with self-enforced module/DI conventions
B. NestJS + TypeScript with framework-supported Modules + DI + exports
C. FastAPI + Python
```

## 3.3 Decision

Select:

```text
NestJS + TypeScript
```

for the core application.

## 3.4 Reasons

The primary reasons are:

1. **Nest Modules map naturally to the frozen logical modules.**

   Example:

   ```text
   ARC-MARKET      → MarketModule
   ARC-STRATEGY    → StrategyModule
   ARC-EXPERIMENT  → ExperimentModule
   ARC-NEWS        → NewsModule
   ARC-API         → ApiModule / transport layer
   ```

2. **Dependency Injection fits the existing Port/Adapter decisions.**

   Examples:

   ```text
   MarketDataProvider
        ↑
   BinanceAdapter / future OkxAdapter

   StrategyGenerator
        ↑
   RandomGenerator / future GeneticGenerator

   SentimentAnalyzer
        ↑
   Node implementation / Python-backed implementation / hosted model adapter
   ```

3. **Module exports/providers make public boundaries visible in code.**

   Cross-module code should depend on exported application/domain ports, not internal repositories/adapters.

4. **The framework gives Codex stronger structural guardrails.**

   This project is intentionally AI-agent-heavy.
   A framework-visible module graph makes it easier to enforce the frozen architecture than a fully convention-driven Express structure.

5. **NestJS provides a coherent HTTP/WebSocket application model.**

   The project already requires request handlers, WebSocket subscriptions, DTO validation, lifecycle management, DI, and modular composition.

6. **The team/project owner is more comfortable in the Node.js ecosystem.**

   This is a legitimate implementation constraint when no project ASR requires Python.

## 3.5 Important limitation

NestJS does **not** solve CPU-heavy backtesting.

The existing architectural rule remains:

```text
Interactive API / WebSocket process
        ↓
durable async queue
        ↓
separate Backtest Worker process(es)
```

Never run long CPU-heavy backtests inside request handlers or the WebSocket gateway.

---

# 4. ML / Sentiment decision

Do not let the ML requirement dictate the language of the entire backend.

The project requirement is a **Sentiment Analysis capability**, not a requirement that the whole application use Python.

Preserve this boundary:

```text
NewsProvider
    ↓
Collector
    ↓
Normalized NewsItem
    ↓
SentimentAnalyzer Port
    ↓
SentimentResult
    ↓
SentimentFeature / SentimentStrategy input
```

The Strategy and Experiment modules must not know:

```text
BERT
FinBERT
Transformers
Python
hosted API
local model
```

They know only the normalized sentiment contract.

Approved initial policy:

```text
Core application: Node.js + TypeScript + NestJS

Sentiment implementation:
- may initially be Node-compatible;
- may call a hosted model;
- may invoke/use a Python worker/service later.

Python is introduced only if the selected model/library creates a real implementation benefit.
```

If Python is later introduced for ML:

```text
NestJS / News Intelligence
        ↓
SentimentAnalyzer contract
        ↓
Python ML runtime
```

This is an implementation behind an existing boundary, not a reason to redesign the core backend.

---

# 5. Mandatory architecture patch #1 — durable event transport

The current baseline contains an ambiguity after the transactional outbox.

It correctly states:

```text
PostgreSQL transaction
  + result
  + state
  + outbox
```

but the durable delivery path after the outbox is not explicit enough.

Redis Pub/Sub is explicitly ephemeral and therefore must **not** be the correctness path for durable integration events.

## 5.1 Required distinction

Define two separate paths.

### Correctness / durable integration path

```text
ResultCommitter
    ↓
PostgreSQL
Result + Status + Outbox
    ↓
OutboxDispatcher
    ↓
BullMQ durable queue
    ↓
Idempotent Consumer
    ↓
PostgreSQL durable state / projection
```

Examples:

```text
StrategyEvaluated
Leaderboard projection work
NewsCollected → sentiment work, when modeled as durable integration work
SentimentAnalyzed consumers, when durable processing is required
```

### Ephemeral UI notification path

After authoritative state/projection is updated:

```text
Authoritative state / projection
    ↓
Redis Pub/Sub
    ↓
NestJS WebSocket Gateway
    ↓
Browser
```

Loss of this notification is acceptable because the client/API can refresh from durable state.

## 5.2 Required semantic rule

Document explicitly:

```text
BullMQ / durable queue = correctness delivery path
Redis Pub/Sub = best-effort live notification path
PostgreSQL = authoritative durable truth
```

Do not conflate these roles.

## 5.3 Outbox publication completion semantics

Define when an outbox entry may be marked delivered.

It must not be considered durably delivered merely because an ephemeral Pub/Sub publish succeeded.

Use BullMQ enqueue acknowledgement / durable job creation semantics as the delivery boundary, with consumer idempotency still required.

---

# 6. Mandatory architecture patch #2 — Frozen is not Proven

The current architecture may remain frozen before implementation proofs run, but the documentation must not imply that `FROZEN` means empirically validated.

Add separate status fields.

Recommended form:

```text
Architecture Status: FROZEN
Baseline Version: <new revision>
Validation Status: PENDING IMPLEMENTATION PROOFS
```

Later allowed values may include:

```text
PENDING IMPLEMENTATION PROOFS
PARTIALLY VERIFIED
VERIFIED AGAINST BASELINE PROOFS
```

Do not claim:

```text
supports 100,000 candidates
meets realtime latency target
scales linearly
```

until proof evidence exists.

The architecture currently defines the **scale path and proof obligation**, not the measured capacity.

---

# 7. Mandatory architecture patch #3 — result transaction wording

The current baseline is slightly too rigid where it can be read as requiring every trade row to be physically committed in the same transaction as all result metadata.

Preserve the integrity goal but allow artifact scaling.

The invariant should become equivalent to:

```text
A completed result cannot be committed unless the complete accepted trade result
is durably represented and cryptographically/content-addressably linked.

The atomic result-acceptance transaction must commit:

- logical result identity
- metrics
- completion state
- immutable trade-data reference/hash or directly stored trade rows
- required provenance references
- outbox record
```

For small MVP results, trades may be stored directly in PostgreSQL.

For larger result artifacts, implementation may later use:

```text
immutable artifact
  ↓
hash/reference
  ↓
atomic result acceptance transaction
```

without changing the logical architecture.

Do not prematurely require external object storage in v1.

---

# 8. Mandatory architecture patch #4 — technology reasoning

The current proposal has stronger reasoning for architecture patterns than for technology realization.

Create or update a technology-realization decision so the technology stack is not just a flat list.

Preferred approach:

```text
ADR-009 - Technology Realization for Baseline <new version>
```

Do **not** create separate top-level ADRs merely named:

```text
ADR-NestJS
ADR-React
ADR-Redis
ADR-PostgreSQL
ADR-Docker
```

The ADR should treat these as child realization choices under the architecture.

It should include at least:

```text
Context
Architecture forces
Candidates
Decision
Consequences
Risks
Evidence
Revisit triggers
```

For the core backend candidate comparison, explicitly include:

```text
Express + TypeScript
NestJS + TypeScript
FastAPI + Python
```

and record the NestJS reasoning from section 3.

For asynchronous processing, update:

```text
Celery + Redis
```

to:

```text
BullMQ + Redis
```

while preserving the architecture-level Queue + Worker decision.

---

# 9. Files/decisions expected to change

Inspect actual repository content before editing.

At minimum, evaluate and update the following if affected:

```text
docs/architecture/architecture-proposal.md
docs/architecture/architecture-baseline.md

docs/adr/ADR-001-modular-monolith-process-roles.md
docs/adr/ADR-004-asynchronous-experiment-processing.md
docs/adr/ADR-005-transactional-results-leaderboard.md
docs/adr/ADR-007-news-sentiment-isolation.md
docs/adr/ADR-008-realtime-delivery-recovery.md

docs/validation/architecture-proof-plan.md

AGENTS.md
CLAUDE.md if it contains architecture/stack-specific instructions
.codex/ and .claude/ project config only if stack-specific assumptions are present

freeze/checksum records
repository governance validation metadata
```

Create:

```text
docs/adr/ADR-009-technology-realization.md
```

unless the repository has an existing convention that requires another number/name.

Do not modify ADRs unrelated to this patch merely for wording consistency.

---

# 10. ADR-specific patch guidance

## ADR-001 — Modular Monolith with Process-Role Separation

Preserve the architecture decision.

Patch technology-specific wording:

```text
one Python application codebase
```

→

```text
one Node.js/TypeScript application codebase using NestJS for the core application
```

Clarify that a future Python ML runtime behind `SentimentAnalyzer` does not violate the coordinated core architecture.

---

## ADR-002 — Strategy/Search contracts

Core decision should remain unchanged.

Do not couple it to NestJS decorators/framework types.

The Strategy domain contract remains framework-independent.

NestJS DI may bind implementations at the application/composition root, but core contracts must not depend on NestJS.

---

## ADR-003 — Provider adapters

Core decision should remain unchanged.

NestJS DI may wire:

```text
MarketDataProvider -> BinanceAdapter
NewsProvider -> concrete provider adapter
```

but provider ports and normalized domain contracts remain framework-independent.

---

## ADR-004 — Asynchronous Experiment Processing

Preserve:

```text
Async queue + separate worker pool
PostgreSQL durable Experiment/job state
At-least-once delivery
Idempotency
SearchCoordinator owns lifecycle
```

Replace technology realization:

```text
Celery + Redis
```

with:

```text
BullMQ + Redis
```

Backtest workers are separate Node.js/TypeScript processes initially.

Do not delegate domain pause/resume/cancel truth to BullMQ.

---

## ADR-005 — Transactional Results and Derived Leaderboard

Preserve:

```text
PostgreSQL local transaction
Transactional Outbox
Idempotent consumer
Derived/rebuildable leaderboard projection
```

Clarify:

```text
OutboxDispatcher -> BullMQ durable delivery
```

for correctness-relevant integration work.

Clarify Redis Pub/Sub is only downstream best-effort notification after authoritative state changes.

Patch the transaction wording according to section 7.

---

## ADR-006 — Immutable Experiment Specification and Provenance

No conceptual change expected.

Ensure technology/build provenance can record:

```text
Node runtime version
dependency lock version/hash
application build/commit
worker build/commit
ML runtime/model artifact when applicable
```

Do not add Python as a mandatory field; it is conditional.

---

## ADR-007 — News/Sentiment Isolation

Preserve the logical boundary.

Update the realization to:

```text
NestJS/Node News Intelligence module
  ↓
SentimentAnalyzer port
  ↓
replaceable implementation
```

Python is optional behind that port.

Do not make the crawler directly depend on a Python model.

---

## ADR-008 — Realtime Delivery and Recovery

Preserve:

```text
WebSocket
subscription isolation
durable snapshot
Market Data-owned reconnect/gap recovery
Redis Pub/Sub as ephemeral live fan-out
PostgreSQL as recovery truth
```

Replace:

```text
FastAPI WebSocket Gateway
```

with:

```text
NestJS WebSocket Gateway
```

Do not change the architecture because the transport framework changes.

---

# 11. NestJS implementation-boundary invariants to add

The baseline should explicitly state that framework structure must reflect, not replace, architecture boundaries.

Recommended invariants:

```text
1. Each major logical architecture module maps to a clear NestJS module/composition boundary.

2. Cross-module access occurs through exported application/domain ports.

3. A module must not import another module's repository implementation,
   infrastructure adapter, ORM model/repository, or private provider.

4. NestJS decorators/types must not leak into framework-independent domain contracts
   where avoidable.

5. Dependency Injection is used at composition/application boundaries,
   not as a service locator inside domain logic.

6. Shared/common modules must contain only truly technical primitives.
   They must not become a business-domain dumping ground.

7. Backtest workers use the same versioned domain/application contracts
   but execute outside the interactive API/WebSocket process.

8. NestJS Module boundaries are implementation support for the frozen architecture;
   creating a Nest module does not by itself prove a valid bounded context.
```

These rules should be enforceable later with dependency/import architecture tests.

---

# 12. Optional reasoning cleanup

There is a minor presentation issue in the current `Architectural Drivers / ASRs` table.

Some rows describe solutions too early, for example a driver may be said to “force registry/adapters/async work”.

Where practical, change this wording from solution-first language:

```text
P-2 requires queue/worker/backpressure
```

to problem/force language:

```text
P-2 requires workload isolation,
controlled concurrency,
capacity management,
failure recovery,
backpressure behavior,
and operability.
```

Then leave concrete technologies/patterns to Candidate Analysis / Decision sections.

This is a documentation-quality improvement, not a redesign requirement.

---

# 13. Decisions intentionally NOT reopened

Do not use this review as an excuse to introduce:

```text
Microservices
Kafka
RabbitMQ
Kubernetes
Service Mesh
Event Sourcing
General CQRS
runtime third-party plugin loading
```

unless the existing reasoning now demonstrably fails.

The current review does not provide such evidence.

Do not replace PostgreSQL.

Do not introduce authentication architecture unless the project owner explicitly resolves the existing authentication open question.

Do not invent ranking weights, fee/slippage values, retention periods, performance targets, or ML model choice.

Those remain versioned implementation policies/open decisions.

---

# 14. Architecture baseline versioning

Because the current baseline is already `FROZEN v1`, do not silently overwrite it as though nothing changed.

Create a new baseline revision according to the repository's versioning convention.

Preferred if supported:

```text
v1.1
```

because:

```text
core architecture style is unchanged;
module boundaries are unchanged;
major domain decisions are unchanged;
technology realization and transport semantics are patched.
```

If the repository only supports integer architecture baselines, use:

```text
v2
```

Document:

```text
Previous baseline: v1
Reason for superseding/revision:
- core backend technology realization changed from Python/FastAPI to Node/NestJS;
- Celery changed to BullMQ;
- durable event transport after Outbox was made explicit;
- frozen/proven status split;
- result-acceptance transaction invariant clarified.
```

Do not delete or rewrite historical evidence of v1.

Update the freeze SHA-256/checksum record for the new baseline.

---

# 15. Validation/proof-plan updates

Do not execute implementation proofs yet.

Update the proof plan only where technology semantics changed.

Examples:

## Scale proof

Measure BullMQ/Redis characteristics instead of Celery-specific metrics where applicable.

Still measure:

```text
worker count
throughput
queue depth
p50/p95 job duration
retries
duplicate logical results
Redis CPU/memory
PostgreSQL latency/locks/connections
worker utilization
```

## Retry proof

Add explicit durable-delivery cases:

```text
outbox committed
dispatcher crashes before BullMQ enqueue
BullMQ enqueue succeeds
dispatcher crashes before marking outbox delivered
consumer crashes after receiving
consumer retries
duplicate job/event delivery
```

Pass condition:

```text
one logical state transition/result/projection
despite at-least-once delivery.
```

## Realtime proof

Use NestJS WebSocket Gateway, but preserve the same architectural proof:

```text
four independent subscriptions
one timeframe change affects one subscription
exchange disconnect
gap recovery
client/API reconnect
durable snapshot before live continuation
slow-client/backpressure observation
```

---

# 16. Governance update

After all architecture artifacts are consistent:

1. run the repository governance validator;
2. update the frozen-baseline reference in `AGENTS.md`;
3. ensure Claude/Codex shared policy is still synchronized semantically;
4. update any architecture checksum/freeze record;
5. confirm no application code has been generated.

The implementation mode should point to the **new frozen baseline revision**.

---

# 17. Required final consistency checks

Before finishing, verify:

```text
[ ] No remaining normative FastAPI requirement exists.
[ ] No remaining normative Celery requirement exists.
[ ] NestJS is selected for architecture-fit reasons, not performance marketing.
[ ] Core domain contracts remain framework-independent.
[ ] BullMQ is the durable async delivery mechanism.
[ ] Redis Pub/Sub is explicitly ephemeral.
[ ] PostgreSQL remains authoritative durable truth.
[ ] Outbox -> BullMQ -> idempotent consumer path is explicit.
[ ] ML does not force Python into the core backend.
[ ] Python is optional only behind SentimentAnalyzer/model boundary.
[ ] Architecture Status and Validation Status are separate.
[ ] Result acceptance transaction supports direct trade rows OR immutable artifact reference/hash.
[ ] Problem Tree and core Decision Tree were preserved.
[ ] Architecture Proof Plan reflects the new runtime stack.
[ ] New ADR-009 or equivalent technology-realization ADR exists.
[ ] Baseline history is preserved.
[ ] New baseline freeze/checksum is recorded.
[ ] Governance validator passes.
[ ] Application coding has NOT started.
```

---

# 18. Required final response

When the update is complete, report:

```text
1. New architecture baseline version/status
2. Validation status
3. Files changed
4. ADRs changed
5. New ADR created
6. FastAPI -> NestJS changes
7. Celery -> BullMQ changes
8. Durable outbox delivery path
9. ML/Python boundary decision
10. Result-transaction clarification
11. Governance validation result
12. Confirmation that application coding has NOT started
```

Also list any contradiction that could not be resolved without reopening a core architecture decision.

---

# 19. STOP CONDITION

After the review patch, documentation synchronization, baseline revision, freeze-record update, and governance validation are complete:

```text
STOP.
```

Do not scaffold NestJS.

Do not create application modules.

Do not implement queue workers.

Do not write migrations.

Do not begin the Walking Skeleton.

A separate implementation prompt will authorize coding.
