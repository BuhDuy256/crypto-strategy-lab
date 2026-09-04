# Evidence index

Start here if you are reviewing this project and want to check a claim rather than read
the whole repository.

Every row below points at something that already exists: a recorded proof run, a test
that runs in the normal suite, or code you can open. Nothing in this index is a summary
written in place of evidence.

## How evidence is organised

| Location | What lives there |
|---|---|
| `docs/validation/evidence/PROOF-*.md` | **Proof records.** One per architecture proof run, written when the proof was executed. Each records the date, environment, commands, and result. These are historical records: they are not rewritten later. |
| `docs/evidence/evidence-*.md` | **Reviewer-facing evidence** for areas that have no single proof record, either because the proof is a V6 obligation or because the evidence is spread across code and tests. |
| `docs/validation/architecture-proof-plan.md` | The authoritative definition of every proof, including the four that are **not** satisfied. |

The proof identifiers (`PROOF-EXT-001` and so on) are traceability keys used across the
baseline, the ADRs, the diagrams, and the tracker. They are kept as filenames on purpose
so a reference anywhere in the repository resolves to an obvious file.

## Architecture claims

| Capability | Primary evidence | Supporting implementation and tests |
|---|---|---|
| A new strategy needs no downstream change | [`PROOF-EXT-001`](../validation/evidence/PROOF-EXT-001.md) | `strategy-registry.ts`, `built-in-strategy-registry.ts`, `macd-strategy-extensibility.proof.test.ts` |
| A second search method needs no downstream change | [`PROOF-REPLACE-001`](../validation/evidence/PROOF-REPLACE-001.md) | `StrategyGenerator` port, `grid-strategy-generator.ts`, `built-in-strategy-generator-registry.ts` |
| A second market provider needs no frontend change | [`PROOF-PROVIDER-001`](../validation/evidence/PROOF-PROVIDER-001.md) | `MarketDataProvider` port, common provider contract suite |
| Module boundaries cannot erode | [`evidence-module-boundaries.md`](evidence-module-boundaries.md) | `architecture/boundary-rules.ts`, `architecture/boundary.test.ts` (7 tests) |
| Stop conditions and pause/resume/cancel survive a restart | [`PROOF-CONTROL-001`](../validation/evidence/PROOF-CONTROL-001.md) | `search-coordinator.ts`, `search-coordinator.test.ts` |
| A leaderboard entry resolves to its frozen specification and reruns identically | [`PROOF-REP-001`](../validation/evidence/PROOF-REP-001.md) | `canonical-json.ts`, `experiment-specification.ts`, `provenance-query.ts` |
| Realtime recovers from a provider outage with no gaps or duplicates | [`PROOF-RT-001`](../validation/evidence/PROOF-RT-001.md) | `reconnect-backoff.ts`, `market-gap-recovery-service.ts`, `missing-intervals.ts` |
| News worker failure does not stop charts, backtests, or discovery | [`PROOF-ISO-001`](../validation/evidence/PROOF-ISO-001.md) | separate `news-worker` process role, `news-endpoint-isolation.test.ts` |
| Sentiment model failure does not stop news collection | [`PROOF-ISO-002`](../validation/evidence/PROOF-ISO-002.md) | `SentimentAnalyzer` port, durable attempt/retry records |
| Heavy work is isolated and the runner scales by configuration | [`evidence-performance-and-scale.md`](evidence-performance-and-scale.md), [`SCENARIO-07-SCALE-DEMO`](../validation/evidence/SCENARIO-07-SCALE-DEMO.md) | separate `runner` process, worker threads, `BACKTEST_RUNNER_CONCURRENCY`, `maxInFlight` |
| Work beyond the minimum requirement | [`evidence-advanced-extensions.md`](evidence-advanced-extensions.md) | six extensions, each with its own evidence |

## Where the architecture itself is defined

| Document | Role |
|---|---|
| [`architecture-report.md`](../architecture/architecture-report.md) | **Start here.** The architecture as delivered, with realization status and the eight central architecture questions answered. |
| [`architecture-baseline.md`](../architecture/architecture-baseline.md) | The frozen normative baseline (v1.2). Implementation must obey it. |
| [`docs/adr/`](../adr/) | Ten accepted decisions, each with context, options, and consequences |
| [`docs/diagrams/`](../diagrams/README.md) | Ten views: problem tree, decisions, context, runtime, boundaries, and flows |
| [`architecture-proposal.md`](../architecture/architecture-proposal.md) | The longer reasoning and trade-off record behind the baseline |

## Running the evidence yourself

```powershell
pnpm run test                                   # whole suite, includes the boundary rules
npx vitest run apps/backend/src/architecture    # the six boundary rules alone
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repo-governance.ps1
```

The measured performance numbers are reproduced with a running Compose topology:

```powershell
docker compose up --build -d
node scripts/measure-backtest-scale.mjs runner-1 24 <a-fresh-seed>
```

## What has no evidence, on purpose

Four proofs in the proof plan have **no** evidence file, and none of them may be
claimed:

| Proof | Why it is open |
|---|---|
| `PROOF-SCALE-001` | Requires BullMQ queue metrics and a bottleneck analysis. V6. Partially and explicitly *not* satisfied by [`evidence-performance-and-scale.md`](evidence-performance-and-scale.md). |
| `PROOF-RETRY-001` | Requires transactional-outbox and broker failure injection. V6. |
| `PROOF-DUP-001` | Requires duplicate broker delivery and inbox deduplication. V6. |
| `PROOF-OBS-001` | Requires correlation across BullMQ jobs, outbox events, and consumers. V6. |

V6 is the final asynchronous realization and is deliberately not built. The full list of
things that must not be claimed is in
[`docs/final-defense-notes.md`](../final-defense-notes.md).
