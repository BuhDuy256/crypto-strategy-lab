# Work beyond the minimum requirement

## What is being demonstrated

Six pieces of work in this repository go past what the minimum product requires. Each
one exists because a specific architectural problem forced it, not to add surface area.

Ordinary requirements are deliberately excluded from this list. Having four strategies,
a backtester, a leaderboard, and a news feed is the assignment, not an extension.

| # | Extension | Architectural problem it solves |
|---|---|---|
| 1 | Executable architecture fitness function | Boundary rules that erode silently |
| 2 | Controlled, restart-survivable search loop | A long search that cannot be steered or resumed |
| 3 | Process-role separation with a configurable worker pool | CPU work competing with interactive traffic |
| 4 | Immutable specification with canonical hashing and provenance | A result nobody can reproduce or trace |
| 5 | Sentiment as a Strategy input, not a special case | ML output leaking into the Strategy Engine |
| 6 | Realtime gap recovery through the append-only writer | Silent holes in market history after an outage |

---

## 1. Architecture rules enforced as a test

**What was implemented.** Six boundary rules over the real source tree, run as part of
the normal test suite, plus one synthetic fixture per rule proving each rule fires.

**Why it is beyond the minimum.** The requirement is to *have* a modular architecture.
This makes violating it a build failure. Adding a forbidden import between modules, or
importing backend code from the frontend, fails `pnpm run test`.

**Evidence.** [`evidence-module-boundaries.md`](evidence-module-boundaries.md) ·
`apps/backend/src/architecture/boundary-rules.ts` ·
`apps/backend/src/architecture/boundary.test.ts` · 7 tests pass at `ff4eef7`.

---

## 2. A search loop that can be steered, stopped, and resumed

**What was implemented.** `SearchCoordinator` runs the full
generate → execute → measure → rank → improve loop with:

- three independent stop conditions: `max-candidates`, `max-duration`,
  `no-improvement`, plus natural `exhausted`;
- durable control states `running / pausing / paused / cancelling / cancelled / stopped`,
  modelled as requested-then-settled rather than a single flag;
- backpressure through `maxInFlight`, so the coordinator waits instead of growing the
  backlog;
- resumption after a process restart, including an iterator fast-forward so a resumed
  run does not re-propose candidates it already generated.

**Why it is beyond the minimum.** The requirement asks for a search that stops. This is
an operable long-running process: an operator can pause it, resume it, cancel it, and
restart the API underneath it without losing or duplicating work.

**Evidence.** `apps/backend/src/modules/experiment/application/search-coordinator.ts` ·
`search-coordinator.test.ts` ·
[`PROOF-CONTROL-001`](../validation/evidence/PROOF-CONTROL-001.md).

---

## 3. Process roles and a worker pool that scales by configuration

**What was implemented.** Backtest execution runs in a separate `runner` process, and
inside it each simulation runs in a Node worker thread. Slot count is
`BACKTEST_RUNNER_CONCURRENCY`; replica count is a Compose scale argument. Work is
claimed from a PostgreSQL queue with leases and heartbeats, so several runner processes
can share one queue safely.

**Why it is beyond the minimum.** The requirement is that backtests run. This makes the
execution tier independently scalable without touching domain code, and the claim is
measured rather than asserted.

**Measurement.** Three runner replicas were added with
`docker compose up -d --scale runner=3`, with no source change. Three distinct runner
processes then claimed work from the same queue (61 / 12 / 11 attempts), and the same
24-candidate workload finished in a median 9802 ms against 14548 ms with one replica.
No run produced more than one successful attempt.

**Evidence.** [`evidence-performance-and-scale.md`](evidence-performance-and-scale.md) ·
`backtest-runner-runtime.ts` · `worker-thread-backtest-computation.ts` ·
`migrations/0005_create_backtest_runs.sql`. Scaling is sublinear and no throughput claim
is made; the limits are listed in that document.

---

## 4. Immutable specifications, canonical hashing, and provenance

**What was implemented.** An experiment specification is frozen before it runs and
identified by a canonical-JSON hash, so logically identical specifications produce the
same identity regardless of key order. A stored result resolves back to the exact frozen
inputs: dataset manifest hash, strategy identity and version, metric-set version,
ranking-policy version, Node.js runtime version, dependency lock hash, and application
and worker build identities. Backtest runs are keyed by a content-derived idempotency
key.

**Why it is beyond the minimum.** The requirement is a leaderboard. This makes any
leaderboard row answerable: what exactly produced this number, and does re-running it
still produce the same number.

**Evidence.** `apps/backend/src/platform/canonical-json.ts` ·
`experiment-specification.ts` · `provenance-query.ts` ·
[`PROOF-REP-001`](../validation/evidence/PROOF-REP-001.md), re-proven against a
generated composite candidate ·
[diagram 09](../diagrams/09-reproducibility-provenance-map.md). Verified live: 302
backtest runs, 302 distinct idempotency keys.

---

## 5. Sentiment as a declared Strategy input

**What was implemented.** `NewsSentimentStrategy` is an ordinary `Strategy`. It declares
`requiredInputs: ["sentiment-series"]` and receives that series through the same
`AnalysisContext` that carries price bars. It never calls the News module, and the
Strategy Engine has no branch for it.

**Why it is beyond the minimum.** The requirement asks for sentiment analysis. Modelling
it as a declared analysis input means a sentiment strategy composes with technical
strategies through the ordinary combination policies, and a missing-data policy is
frozen into the experiment specification rather than decided at runtime.

**Evidence.** `apps/backend/src/modules/strategy/domain/news-sentiment-strategy.ts` ·
`sentiment-feature-context-assembler.ts` · `backtest-runner-sentiment.test.ts` ·
[`PROOF-ISO-002`](../validation/evidence/PROOF-ISO-002.md).

**Limitation, stated plainly.** This path is exercised through the API and tests, not
through a Backtest page form. The Backtest page offers only strategies whose inputs it
can supply, so the capability is real but is demonstrated over HTTP rather than by
clicking.

---

## 6. Realtime gap recovery through the append-only writer

**What was implemented.** After a provider outage, the ingest process computes exactly
which closed intervals are missing, refetches them over REST, and writes them through
the *same* append-only writer that live candles use, bounded by `MAX_RECOVERY_PASSES`.
Reconnect uses a documented 1s → 30s backoff schedule chosen against Binance's
300-attempts-per-5-minutes budget.

**Why it is beyond the minimum.** The requirement is a live chart. This closes the case
the requirement does not mention: what the history looks like after the connection
drops. Recovery produces neither gaps nor duplicates because it reuses the ordinary
write path instead of a special repair path.

**Evidence.** `market-gap-recovery-service.ts` · `missing-intervals.ts` ·
`reconnect-backoff.ts` · [`PROOF-RT-001`](../validation/evidence/PROOF-RT-001.md) ·
`pnpm run smoke:mkt09`.

---

## What is NOT claimed

- None of this is a V6 property. No BullMQ, no transactional outbox, no broker retry, no
  duplicate-delivery safety. See [`final-defense-notes.md`](../final-defense-notes.md).
- Item 3 is not a scalability measurement in the `PROOF-SCALE-001` sense. It is one
  small workload on one laptop.
- Item 5's UI limitation is stated above and is not worked around.
- Optional search methods (genetic, Bayesian), full Smart Money Concepts, full Wyckoff,
  and optional metrics such as Profit Factor and Sharpe are **not** implemented. The
  architecture supports adding them; that support is demonstrated by
  [`PROOF-EXT-001`](../validation/evidence/PROOF-EXT-001.md) and
  [`PROOF-REPLACE-001`](../validation/evidence/PROOF-REPLACE-001.md), which is a
  different claim from having built them.
