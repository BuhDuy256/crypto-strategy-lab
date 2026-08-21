# BOOTSTRAP.md — Repository & Architecture Bootstrap for Crypto Strategy Lab

> **Purpose**
>
> This file is the single entry point for bootstrapping the repository **before application coding begins**.
>
> The agent executing this file must:
>
> 1. set up repository-level AI governance for Codex and Claude;
> 2. set up project-scoped agent configuration;
> 3. discover and install justified reusable skills safely;
> 4. analyze the project specification and supporting architecture materials;
> 5. derive the architecture from the problem through an explicit reasoning chain;
> 6. challenge the proposed architecture against change, scale, failure, and reproducibility scenarios;
> 7. produce a final architecture proposal, architecture baseline, ADRs, and proof plan;
> 8. freeze the accepted architecture as the normative implementation constraint;
> 9. **stop before writing application code**.
>
> This file is intentionally process-oriented. Do **not** jump directly from requirements to technologies.

---

# 0. Global execution contract

## 0.1 Execution mode

Execute this bootstrap as a staged workflow.

Do not skip a phase because a plausible solution is already obvious.

The required reasoning direction is:

```text
Source Materials
    ↓
Facts / Requirements / Constraints / Assumptions
    ↓
Problem Tree
    ↓
Architecture Problems
    ↓
Architectural Drivers / ASRs
    ↓
Quality Attribute Scenarios
    ↓
Forces / Sub-problems
    ↓
Candidate Solutions
    ↓
Trade-offs
    ↓
Decisions
    ↓
Decision Tree
    ↓
Resulting Architecture
    ↓
Architecture Challenge
    ↓
Final Architecture Proposal
    ↓
Architecture Baseline + ADRs
    ↓
Freeze
    ↓
STOP
```

The forbidden reasoning shortcut is:

```text
Requirement
    ↓
Technology
```

Examples of forbidden shortcuts:

```text
Scalability → BullMQ
Realtime → WebSocket
Modifiability → Plugin Registry
Heavy reads → Read Replica
```

Those technologies or patterns may ultimately be selected, but only after the intermediate reasoning has been made explicit.

---

## 0.2 Application coding is out of scope

During bootstrap, do **not** implement:

- production frontend;
- production backend;
- market-data integration;
- strategy implementations;
- backtesting logic;
- database schema migrations for the application;
- news crawler;
- sentiment model integration;
- deployment manifests for the running application;
- feature code.

Repository governance scripts and validation scripts required by this bootstrap are allowed.

At the end of this workflow, stop.

A later task will explicitly begin implementation against the frozen architecture baseline.

---

## 0.3 Architecture is proposed first, normative only after freeze

Before freeze:

```text
Architecture = proposal
```

The agent may:

- challenge assumptions;
- discard proposed decisions;
- compare alternatives;
- revise decomposition;
- revise boundaries;
- revise technology candidates.

After freeze:

```text
Architecture Baseline = implementation constraint
```

Implementation agents must not silently redesign the system.

---

## 0.4 Idempotency

This bootstrap must be safe to run more than once.

Before creating or modifying an artifact:

1. inspect whether it already exists;
2. determine its current status;
3. preserve accepted/frozen artifacts;
4. never overwrite an accepted architecture baseline silently;
5. never silently replace an ADR with a different decision;
6. never reinstall or upgrade a skill without checking the skill manifest/lock;
7. when the repository is already frozen, enter **verification mode**, not redesign mode.

If a frozen baseline already exists, do not restart architecture design unless explicitly instructed by the user.

---

# 1. Source materials

## 1.1 Expected project sources

Search the repository for all relevant source material before analysis.

Expected materials may include files such as:

```text
Crypto Strategy Lab – Đồ án cuối kỳ*.pdf
KienTrucDoAn_slide*.pdf
phân tích solution của Phát.md
```

They may also be stored under folders such as:

```text
references/
docs/source/
materials/
spec/
```

Do not rely only on file names. Inspect the contents.

---

## 1.2 Source authority

Use the following precedence when sources conflict:

```text
1. Official project specification / assignment
2. Official course / lecturer architecture material
3. User-provided architecture analysis or critique
4. Existing repository documentation
5. Agent inference
6. External sources
```

Do not silently convert an inference into a requirement.

---

## 1.3 Required classification

Before architecture reasoning, extract source information into exactly these categories:

```text
FACT
REQUIREMENT
CONSTRAINT
ASSUMPTION
OPEN QUESTION
```

### FACT

A directly supported statement about the problem or source material.

### REQUIREMENT

A behavior, capability, deliverable, or quality explicitly required.

### CONSTRAINT

A restriction that limits viable solutions.

### ASSUMPTION

A design assumption introduced because the source does not specify a value or condition.

Examples:

```text
1,000 concurrent users
sub-50 ms latency
10:1 read/write ratio
specific cloud provider
specific database size
```

These are assumptions unless the source explicitly requires them.

### OPEN QUESTION

An unresolved point that may materially affect architecture.

---

## 1.4 No hidden requirements

Never treat an invented number as a project requirement.

Every non-source number that influences architecture must be marked as:

```text
DESIGN ASSUMPTION
```

and should later be validated or challenged.

---

# 2. Repository bootstrap

Create the repository governance layer before architecture implementation documents.

The initial target structure is:

```text
/
├── BOOTSTRAP.md
├── AGENTS.md
├── CLAUDE.md
│
├── .codex/
├── .claude/
├── .agents/
│
├── docs/
│   ├── source/
│   ├── architecture/
│   ├── adr/
│   └── validation/
│
└── scripts/
```

Do not create application source folders yet unless they already exist.

---

# 3. Agent governance

## 3.1 Canonical shared instructions

`AGENTS.md` is the canonical source for shared project instructions.

Shared instructions must exist in one canonical location only.

Do not duplicate large shared rule sets independently in both:

```text
AGENTS.md
CLAUDE.md
```

The intended relationship is:

```text
AGENTS.md
   ↑
   │ shared project rules
   │
CLAUDE.md
   └── Claude-specific delta only
```

Where supported, `CLAUDE.md` should import or reuse `AGENTS.md`.

---

## 3.2 `AGENTS.md` must define at least

Create `AGENTS.md` with rules covering:

### Project mode

```text
Current mode:
ARCHITECTURE BOOTSTRAP
```

Later, after freeze:

```text
Current mode:
IMPLEMENTATION AGAINST FROZEN ARCHITECTURE
```

### Source-of-truth hierarchy

Before freeze:

```text
1. Official project sources
2. BOOTSTRAP.md
3. Architecture proposal artifacts
4. Agent judgment
```

After freeze:

```text
1. docs/architecture/architecture-baseline.md
2. Accepted ADRs
3. Official project sources
4. Project coding conventions
5. Agent judgment
```

### Architecture deviation rule

After freeze, if implementation conflicts with the architecture:

```text
DO NOT silently redesign.
```

Instead:

1. stop the affected implementation;
2. identify the conflicting baseline section;
3. identify the affected ADR/problem branch;
4. explain the implementation conflict;
5. propose alternatives and consequences;
6. wait for explicit architecture review.

### No architecture drift

Do not casually change:

- bounded contexts;
- module ownership;
- public contracts;
- event ownership;
- data ownership;
- deployment boundaries;
- major runtime communication style;
- persistence ownership;
- core architectural patterns;
- accepted major technology decisions.

---

# 4. Claude and Codex configuration

## 4.1 Semantic synchronization, not file cloning

Do not attempt to make `.codex/` and `.claude/` byte-for-byte identical.

Their configuration formats and capabilities differ.

Synchronize **policy semantics**.

Conceptually:

```text
Shared Project Policy
        │
        ├── Codex representation
        │      ├── AGENTS.md
        │      ├── .codex/
        │      └── .agents/
        │
        └── Claude representation
               ├── CLAUDE.md
               └── .claude/
```

---

## 4.2 Required synchronization invariant

The repository must enforce this invariant:

> A rule that applies to both Codex and Claude belongs in the shared policy, not in duplicated agent-specific files.

Agent-specific files contain only platform-specific configuration or behavior.

---

## 4.3 Project config setup

Inspect current Codex and Claude project configuration conventions before generating configuration.

Create only justified project-level files.

Typical targets may include:

```text
.codex/config.toml

.claude/settings.json
.claude/rules/
.claude/skills/
.claude/agents/

.agents/skills/
```

Do not create empty folders without a purpose.

---

# 5. Repository governance validation

Create a lightweight repository governance validator under `scripts/`.

Its exact implementation is up to the agent, but it must check at least:

```text
[ ] AGENTS.md exists
[ ] CLAUDE.md correctly reuses shared instructions
[ ] no large duplicated shared policy exists
[ ] required architecture artifacts exist after bootstrap
[ ] architecture baseline status is valid
[ ] accepted ADR references resolve
[ ] architecture references to ADRs resolve
[ ] skill manifest matches installed project skills
[ ] skill lock entries resolve to installed content
[ ] frozen baseline is not silently replaced
```

The validator should return non-zero status when a governance invariant fails.

Name it clearly, for example:

```text
scripts/check-repo-governance
```

or an equivalent cross-platform script.

Do not build a large framework for this.

---

# 6. Skills discovery and setup

Codex is allowed to discover reusable skills that materially improve this project.

The user does **not** want a manually curated skill list.

The agent must perform skill discovery itself.

---

## 6.1 Skill discovery scope

Search for reusable skills relevant to:

- architecture reasoning;
- repository governance;
- architecture review;
- ADR quality;
- C4 / architecture documentation;
- testing strategy;
- code review;
- documentation consistency;
- agent workflow quality;
- secure repository practices;
- reproducibility;
- implementation discipline.

Examples such as `karpathy-guidelines` may be considered if found, but no named skill is automatically required.

---

## 6.2 Skill evaluation requirements

For every candidate skill, record:

```text
name
source
source repository / package
version or commit
license
purpose
why it is relevant
Codex compatibility
Claude compatibility
scripts/dependencies
security considerations
installation destination
decision: install / reject / defer
```

---

## 6.3 Skill safety rule

Forbidden:

```text
discover → install latest → execute blindly
```

Required:

```text
discover
   ↓
inspect
   ↓
evaluate relevance
   ↓
inspect scripts/dependencies
   ↓
record source/version
   ↓
install
   ↓
lock
```

---

## 6.4 Skill manifest and lock

Create a project-level manifest and lock mechanism.

Suggested location:

```text
.agents/
├── skills/
├── skill-manifest.yaml
└── skill-lock.yaml
```

Equivalent formats are acceptable.

The manifest describes intended skills.

The lock records exact installed provenance.

A lock entry should be able to answer:

```text
Where did this skill come from?
Which version/commit?
When was it installed?
Why is it present?
Has the source changed?
```

---

## 6.5 Skill authority

Skills may help the reasoning process.

Skills may **not** override the mandatory architecture reasoning process in this file.

A skill recommendation is not an architectural justification.

---

# 7. Architecture analysis mode

After repository governance and skills setup, enter:

```text
ARCHITECT MODE
```

Do not begin with technology selection.

---

# 8. Phase A — Build the factual model

Create an internal factual model from the source materials.

The factual model must explicitly include:

```text
System goals
Functional requirements
Architecture-significant requirements
Quality attributes
Constraints
External systems
Required deliverables
Known change scenarios
Known failure scenarios
Known scale scenarios
Required reproducibility concerns
Assumptions
Open questions
```

Do not call a technology choice a requirement.

---

# 9. Phase B — Build the Problem Tree

Before choosing any architecture style or technology, build a hierarchical Problem Tree.

A problem tree must express parent-child reasoning.

Example shape:

```text
P1 — The system must evolve without ripple changes
│
├── P1.1 Add a new strategy without changing unrelated components
├── P1.2 Replace the strategy search algorithm independently
└── P1.3 Replace a market-data provider without changing frontend logic


P2 — Experiment workload can grow dramatically
│
├── P2.1 CPU-heavy backtests can block other work
├── P2.2 Candidate production may exceed processing capacity
├── P2.3 Failed jobs require controlled retry
├── P2.4 Search execution needs pause/resume/stop
├── P2.5 Progress and failures must be observable
└── P2.6 Persistence may become a bottleneck


P3 — Market data is realtime and externally controlled
│
├── P3.1 Data must reach the UI with low delay
├── P3.2 Provider disconnects must recover
├── P3.3 Missing intervals must be detected/recovered
└── P3.4 Multiple chart subscriptions must remain isolated


P4 — Subsystems can fail independently
│
├── P4.1 News failure must not kill market-data/chart flow
├── P4.2 Sentiment failure must not kill technical strategies
├── P4.3 External exchange failure must degrade predictably
└── P4.4 Worker failure must not corrupt experiment state


P5 — Experimental results must be explainable and reproducible
│
├── P5.1 Strategy version must be traceable
├── P5.2 Parameters must be traceable
├── P5.3 Dataset/time range/timeframe must be traceable
├── P5.4 Backtest configuration must be traceable
├── P5.5 Model/preprocessing version must be traceable when ML is used
└── P5.6 Randomness must be controlled when applicable
```

This example is illustrative.

The final tree must be derived from the actual project sources.

---

## 9.1 Problem Tree rule

At this phase, do not select:

- Redis;
- Kafka;
- RabbitMQ;
- BullMQ;
- WebSocket library;
- framework;
- database;
- ORM;
- cloud provider;
- Kubernetes;
- microservices;
- CQRS;
- Event Sourcing.

Pattern or technology names may appear only if a source itself explicitly mandates them, and such mandates must be classified as constraints.

---

# 10. Phase C — Derive Architectural Drivers / ASRs

For each meaningful problem branch, derive the relevant architectural driver.

Possible drivers include, where supported:

- Modifiability
- Replaceability
- Scalability
- Performance
- Realtime behavior
- Reliability
- Availability
- Maintainability
- Observability
- Reproducibility
- Security
- Data integrity
- Operability

Do not invent a driver only because it sounds architecturally sophisticated.

---

# 11. Phase D — Write measurable scenarios

Convert major drivers into concrete scenarios.

Use a structured scenario format equivalent to:

```text
SOURCE
STIMULUS
ENVIRONMENT
ARTIFACT
RESPONSE
MEASURE
```

Example:

```text
Scenario ID: QA-MOD-001

Source:
Developer

Stimulus:
Adds MACDStrategy.

Environment:
Normal development.

Artifact:
Strategy subsystem.

Response:
The system supports registration and execution of the new strategy.

Measure:
No changes are required in Backtester, Evaluator, Leaderboard,
market-data adapter, or frontend core.
```

Another example:

```text
Scenario ID: QA-REL-001

Source:
Binance connection

Stimulus:
WebSocket disconnects unexpectedly.

Environment:
Realtime market-data operation.

Artifact:
Market-data subsystem.

Response:
Reconnect, detect missing candle ranges, recover gaps,
resume normalized stream.

Measure:
No duplicated candle is committed and no known gap remains unrecovered.
```

Do not invent numerical targets unless clearly labeled as design assumptions.

---

# 12. Phase E — Identify forces and sub-problems

Before generating solution candidates, identify the forces that make each architecture problem non-trivial.

Example:

```text
Problem:
Large backtest workload.

Forces:
- CPU-heavy processing
- producer/consumer imbalance
- failure/retry
- user cancellation
- pause/resume
- backpressure
- progress reporting
- duplicate execution risk
- persistence contention
- separation from realtime workloads
```

This phase exists specifically to prevent the shortcut:

```text
100,000 candidates → queue
```

---

# 13. Phase F — Generate solution candidates

For each major architecture problem, produce multiple credible candidates.

Do not compare a well-designed solution against a deliberately bad strawman.

For example, when comparing architecture styles, do **not** define:

```text
Monolith = God Service
Microservices = cleanly modular
```

A valid comparison should use viable alternatives, for example:

```text
A. well-structured layered monolith
B. modular monolith
C. selectively separated worker processes
D. microservices
```

Compare them using the actual forces and scenarios.

---

# 14. Phase G — Trade-off analysis

For every major decision, record:

```text
Problem / scenario
Forces
Candidate A
Candidate B
Candidate C
...
Selected option
Why selected
Why alternatives were not selected
Benefits
Costs
Risks
Assumptions
Evidence needed
Revisit trigger
```

No option is "best" in the abstract.

The selected option must be best **under the current drivers and constraints**.

---

# 15. Phase H — Build a Decision Tree

Do not represent every decision as a flat list.

Model parent-child relationships.

Example:

```text
P2 Experiment workload
│
└── D2 Asynchronous backtest processing
    │
    ├── D2.1 Queue + Worker pattern
    │
    ├── D2.2 Job idempotency
    │
    ├── D2.3 Retry policy
    │
    └── D2.4 Technology realization
        ├── Queue technology
        └── backing store
```

Technology decisions are frequently children of architectural decisions.

Do not automatically create a separate top-level ADR for every library.

---

# 16. Phase I — Compose the resulting architecture

Only after the decision tree is sufficiently justified may the agent compose the proposed architecture.

The proposal must cover at least:

## 16.1 System Context

- user / actor;
- Crypto Strategy Lab;
- exchange provider(s);
- news provider(s);
- relevant external systems.

## 16.2 Container / deployable view

Show candidate deployable/process boundaries.

Do not assume microservices are required.

A modular monolith plus separately scalable workers is a valid candidate if it best fits the drivers.

## 16.3 Logical module / bounded-context decomposition

At minimum evaluate boundaries around concepts such as:

```text
Market Data
Strategy
Experiment
News Intelligence
API / Presentation
```

Do not merge modules solely because they use the same programming language.

Remember:

```text
Logical boundary ≠ Deployment boundary
```

Two modules may deploy together while remaining logically independent.

## 16.4 Component responsibilities

Define responsibility and owner for major components.

Avoid ambiguous ownership.

For example, explicitly answer:

```text
Who owns Experiment creation?
Who owns Experiment state transitions?
Who owns backtest simulation?
Who owns metrics evaluation?
Who owns ranking?
Who owns strategy registration?
Who owns event publication?
Who owns persistence for each aggregate/data set?
```

## 16.5 Contracts

Define important architecture-level contracts.

Examples:

```text
Strategy
StrategyGenerator
CandidateStrategy
MarketDataProvider
Normalized Candle
BacktestJob
BacktestResult
SentimentResult
NewsItem
```

Do not over-specify application code signatures unless needed to prove a boundary.

## 16.6 Runtime flows

At minimum document:

```text
Realtime market-data flow
Strategy execution flow
Search → backtest → evaluate → rank flow
Leaderboard update flow
News → sentiment flow
Failure/recovery flow
```

If a process/container boundary exists, show how data crosses it.

Do not depict an in-process event bus crossing process boundaries unless an explicit bridge exists.

## 16.7 Data ownership

Document which module owns which data.

Address:

- market data;
- strategy definitions and versions;
- experiment definitions;
- trades;
- metrics;
- leaderboard projections;
- news;
- sentiment predictions;
- model/version metadata.

## 16.8 Reproducibility model

A reproducible experiment must identify all materially relevant inputs.

Evaluate at least:

```text
strategy versions
strategy parameters
composite configuration
dataset identity/version
date range
timeframe
fees
slippage
backtest engine version
search configuration
sentiment model version
preprocessing/input version
random seed when applicable
code/build version when materially relevant
```

Do not claim:

```text
same strategy version = reproducible experiment
```

unless the other relevant inputs are also fixed.

## 16.9 Deployment topology

Document the proposed initial deployment and possible scale-out path.

Do not add Kubernetes, service mesh, or microservices merely because they are available technologies.

Every infrastructure technology must trace to a concrete driver/problem.

---

# 17. Phase J — Architecture challenge

After composing the proposed architecture, attack it.

Do not merely review formatting.

Run architecture thought experiments against the design.

Required challenge set:

```text
C1. Add MACDStrategy.
C2. Replace Random Search with Domain-Guided or Genetic Search.
C3. Add a new market-data provider such as OKX.
C4. Increase candidate workload from small scale to very large scale.
C5. Increase worker count.
C6. Kill the News subsystem.
C7. Make Sentiment inference unavailable.
C8. Disconnect the exchange WebSocket.
C9. Retry a backtest job after partial failure.
C10. Deliver a duplicate completion/event.
C11. Trace the current Top #1 strategy to the exact experiment configuration.
C12. Replace the sentiment model without changing the strategy engine.
```

For every challenge, answer:

```text
What changes?
What should not change?
Which component owns recovery?
Which architectural decision is exercised?
Which quality attribute is being tested?
What observable evidence would prove the claim?
```

---

# 18. Challenge failure rule

If a challenge exposes a weak architecture:

```text
DO NOT patch the final document only.
```

Return to the affected branch:

```text
Problem
   ↓
Scenario
   ↓
Forces
   ↓
Candidates
   ↓
Decision
   ↓
Architecture
```

Then update downstream artifacts consistently.

---

# 19. Required final artifacts

After architecture reasoning and challenge are complete, produce the following artifacts.

---

## 19.1 `docs/architecture/architecture-proposal.md`

This is the full reasoning artifact.

It must preserve the logical chain.

Required structure:

```text
1. Purpose and scope
2. Source materials
3. Facts
4. Requirements
5. Constraints
6. Assumptions
7. Open questions
8. Problem Tree
9. Architectural Drivers / ASRs
10. Quality Attribute Scenarios
11. Forces / sub-problems
12. Candidate solution analysis
13. Decision Tree
14. Resulting architecture
15. System Context
16. Container/deployable view
17. Logical module/component decomposition
18. Runtime flows
19. Contracts
20. Data ownership
21. Reproducibility model
22. Deployment model
23. Architecture challenge results
24. Risks
25. Revisit triggers
26. Final recommendation
```

The proposal is the primary reasoning record.

It is allowed to be long.

---

## 19.2 `docs/architecture/architecture-baseline.md`

This is the normative architecture after acceptance/freeze.

It must be substantially more concise than the proposal.

It should answer:

```text
What architecture must implementation follow?
```

Required sections:

```text
Status
Baseline version
Scope
Architecture style
System boundaries
Logical modules / bounded contexts
Responsibilities
Allowed dependency directions
Contracts
Runtime communication
Events
Data ownership
Persistence rules
Reproducibility rules
Deployment topology
Technology decisions
Architectural invariants
References to ADRs
Deviation procedure
```

Avoid repeating the full exploration history.

---

## 19.3 `docs/adr/`

Create ADRs only for meaningful architectural decisions.

Prefer ADRs organized around architecture problems, not library names.

Good examples:

```text
ADR-001 Strategy extensibility through plugin/registry boundary
ADR-002 Market-data provider abstraction and normalized contract
ADR-003 Search-generator replaceability
ADR-004 Asynchronous backtest processing
ADR-005 Experiment ownership and reproducibility model
ADR-006 News collection and sentiment boundary
ADR-007 Initial deployment style
```

The final numbering/titles must come from the actual decision tree.

Do not create ADRs merely to inflate the count.

---

## 19.4 ADR format

Each ADR must contain:

```text
Title
Status
Decision ID
Related Problem IDs
Related Scenario IDs

Context
Decision
Alternatives considered
Why this option
Consequences
Risks
Evidence / validation
Revisit triggers
Affected architecture sections
Supersedes / Superseded by
```

Accepted ADRs must reference the architecture baseline.

The architecture baseline must reference the relevant ADRs.

---

## 19.5 `docs/validation/architecture-proof-plan.md`

Create a plan for later implementation-time architecture proof.

At minimum include:

### Extensibility proof

```text
Add MACDStrategy.
Measure unrelated components changed.
```

### Replaceability proof

```text
Replace Random Search with another generator.
Verify Backtester/Evaluator/Leaderboard remain unchanged.
```

### Scale proof

```text
Increase worker count.
Observe throughput, queue depth, duplicates, persistence contention.
```

### Failure isolation proof

```text
Disable News/Sentiment.
Verify realtime chart and technical backtesting remain operational.
```

### Realtime recovery proof

```text
Disconnect market-data provider.
Verify reconnect + gap recovery behavior.
```

### Reproducibility proof

```text
Take a leaderboard entry.
Trace it to the complete immutable experiment specification.
```

This file defines future evidence.

It does not need to execute those proofs during bootstrap.

---

# 20. Architecture traceability

Use stable IDs in the proposal.

Recommended prefixes:

```text
P-     Problem
QA-    Quality Attribute Scenario
D-     Decision
ADR-   Architecture Decision Record
ARC-   Architecture section/component
PROOF- Architecture proof
```

Example:

```text
P-2.2
   ↓
QA-SCAL-002
   ↓
D-04
   ↓
ADR-004
   ↓
ARC-EXPERIMENT-ASYNC
   ↓
PROOF-SCALE-001
```

Traceability should be readable by a human.

Do not create a complex graph database or documentation framework.

---

# 21. Freeze procedure

When the architecture proposal has completed challenge review and no unresolved blocker prevents implementation, freeze the baseline.

Update:

```text
docs/architecture/architecture-baseline.md
```

with:

```text
Status: FROZEN
Baseline Version: v1
```

Also update `AGENTS.md` to enter implementation mode.

---

# 22. Frozen architecture rules

After freeze, all implementation agents must treat the baseline as authoritative.

The following rule must be present in agent governance:

```text
The frozen architecture baseline is normative.

Do not alter architectural boundaries, dependency directions,
contracts, ownership, communication style, persistence ownership,
deployment model, or major accepted architectural decisions silently.

If implementation reveals a conflict:
1. stop the affected work;
2. identify the baseline section and ADR;
3. describe the conflict;
4. explain why the baseline may be insufficient;
5. propose alternatives and their consequences;
6. request explicit architecture review.
```

---

# 23. Reopening architecture

"Frozen" does not mean immutable forever.

It means:

```text
No implicit redesign during implementation.
```

Architecture may be reopened only explicitly.

Reopen workflow:

```text
Implementation conflict
    ↓
Affected problem branch
    ↓
Re-evaluate scenario / assumption
    ↓
New candidates
    ↓
New or superseding decision
    ↓
Update proposal reasoning
    ↓
Update ADR
    ↓
Create new architecture baseline version
```

Example:

```text
Baseline v1
    ↓
Architecture review
    ↓
ADR-00X supersedes ADR-00Y
    ↓
Baseline v2
```

Never rewrite history to make it look like the previous decision never existed.

---

# 24. Proposal vs Baseline

These artifacts have different roles.

## Architecture Proposal

Answers:

> Why did we reach this architecture?

Contains:

```text
problem reasoning
assumptions
alternatives
rejected options
trade-offs
decision tree
challenge results
```

## Architecture Baseline

Answers:

> What architecture must the implementation follow now?

Contains:

```text
normative structure
boundaries
contracts
ownership
communication
deployment
invariants
```

Do not merge their roles.

---

# 25. Final bootstrap verification

Before declaring bootstrap complete, verify:

```text
Repository governance
[ ] AGENTS.md exists and is canonical for shared rules
[ ] CLAUDE.md contains only Claude-specific delta/reuse
[ ] Codex/Claude project configs are semantically aligned
[ ] governance validation script passes

Skills
[ ] candidate skills were evaluated
[ ] installed skills have manifest entries
[ ] installed skills have lock/provenance entries
[ ] no unreviewed skill is auto-executed

Architecture reasoning
[ ] facts are separated from assumptions
[ ] Problem Tree exists
[ ] major ASRs are identified
[ ] measurable scenarios exist
[ ] solution candidates were compared
[ ] no obvious strawman comparison was used
[ ] Decision Tree shows parent-child relationships
[ ] technology decisions trace to architecture problems
[ ] runtime process boundaries are explicit
[ ] logical boundaries are distinguished from deployment boundaries
[ ] reproducibility covers more than strategy version

Architecture outputs
[ ] architecture-proposal.md exists
[ ] architecture-baseline.md exists
[ ] accepted ADRs exist
[ ] architecture-proof-plan.md exists
[ ] references between artifacts resolve

Challenge
[ ] extensibility challenge performed
[ ] replaceability challenge performed
[ ] scalability challenge performed
[ ] failure-isolation challenge performed
[ ] realtime recovery challenge performed
[ ] reproducibility challenge performed

Freeze
[ ] baseline is marked FROZEN
[ ] baseline version is recorded
[ ] AGENTS.md switched to implementation-against-baseline mode
[ ] architecture deviation procedure is documented
```

---

# 26. Required final response from the executing agent

When bootstrap is complete, report only the bootstrap result.

The report should include:

```text
1. Repository governance created
2. Agent configuration created
3. Skills installed / rejected / deferred
4. Source materials analyzed
5. Architecture proposal location
6. Architecture baseline location
7. ADR count and index
8. Architecture proof plan location
9. Architecture baseline version/status
10. Open risks or unresolved questions
11. Confirmation that application coding has NOT started
```

Do not begin implementation automatically.

---

# 27. STOP CONDITION

The bootstrap is complete when:

```text
AGENTS / Claude / Codex governance
            +
skill setup
            +
architecture reasoning
            +
architecture challenge
            +
architecture proposal
            +
architecture baseline
            +
ADRs
            +
architecture proof plan
            +
freeze
```

are complete.

Then:

```text
STOP.
```

Do not create application features.

Do not continue into coding.

Wait for a separate implementation instruction.

---

# 28. Mental model

The entire bootstrap should follow this principle:

```text
Do not start with:
"What technology should we use?"

Start with:
"What can change?"
"What can fail?"
"What becomes expensive at scale?"
"What must remain independent?"
"What must be reproducible?"
"What evidence would prove the architecture claim?"
```

And preserve the reasoning chain:

```text
Problem
    ↓
Architecture Problem
    ↓
Driver
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

That chain is the primary quality bar for the resulting architecture.
