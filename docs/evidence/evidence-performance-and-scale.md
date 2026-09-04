# Performance and scalability

## What is being demonstrated

Backtesting is the only CPU-heavy work in this system. This document separates five
different claims that are easy to blur together, and states which ones the repository
can actually support today.

| # | Claim | Status |
|---|---|---|
| A | Heavy work never runs on the interactive path | Implemented and observed |
| B | Long-running workloads survive restarts and operator control | Implemented and proven (`PROOF-CONTROL-001`) |
| C | The architecture allows execution to scale without changing domain code | Implemented |
| D | The current runner scales horizontally by configuration alone | Implemented and observed, this document |
| E | Measured scalability with a throughput target | **Measured on one machine only. No target, no curve, no claim.** |

A, B, C, and D are safe to state. E is not, and the limits are listed at the end.

## Why it matters architecturally

The official source asks how the system would grow from a hundred backtests to a very
large number. That question has an architectural answer and an empirical answer, and
they are not the same answer.

The architectural answer is that backtest execution sits behind a port
(`BacktestComputation`) and runs in a process role that is not the API. Nothing in the
Strategy or Experiment domain knows how many workers exist. Adding workers is therefore
a deployment decision.

The empirical answer is that this has been measured once, on one laptop, at small
scale. That measurement is recorded below because an unmeasured architecture claim is
only a design intention.

## Current implementation

| Mechanism | Where |
|---|---|
| Execution behind a port | `apps/backend/src/modules/experiment/application/backtest-computation.ts` |
| CPU isolation in a worker thread | `apps/backend/src/modules/experiment/infrastructure/worker-thread-backtest-computation.ts` |
| Separate runner process role | `apps/backend/src/main.backtest-runner.ts`, `runner` service in `docker-compose.yml` |
| Configurable slots per process | `BACKTEST_RUNNER_CONCURRENCY`, `apps/backend/src/modules/experiment/application/backtest-runner-runtime.ts` |
| Claim/lease/heartbeat queue in PostgreSQL | `apps/backend/src/modules/experiment/infrastructure/postgres-backtest-run-store.ts`, `apps/backend/migrations/0005_create_backtest_runs.sql` |
| Backpressure bound | `maxInFlight`, `apps/backend/src/modules/experiment/application/search-coordinator.ts` |
| Per-attempt timing, stored durably | `experiment.backtest_attempts.claimed_at` / `.completed_at` |

The runner service deliberately has no `container_name` in `docker-compose.yml`, which
is what makes `--scale runner=N` possible.

## Evidence

### Environment

| Item | Value |
|---|---|
| Commit | `ff4eef7` |
| Date | 2026-09-04 |
| Host | Intel Core i7-1355U, 12 logical CPUs, 15.7 GB RAM, Windows 11 |
| Topology | Docker Compose, the documented full-system path |
| Runner image runtime | Node.js v22.23.2 on Alpine Linux |
| Dataset | `binance` / `BTCUSDT` / `1h`, 30-day window ending 2026-09-03T20:00:00Z |
| Workload | 24 candidates, `random-search`, four price-bar strategies, `compositeSizes: [1]`, `maxInFlight: 8`, stop condition `maxCandidates: 24` |

This is a developer laptop running all seven service roles plus PostgreSQL and Redis at
the same time. It is not a performance test rig, and the numbers below should be read
as a lower bound on a contended machine.

### A. Interactive-path isolation

The API process never executes a backtest. Work is claimed from PostgreSQL by the
`runner` process, and inside that process the simulation runs in a worker thread.

```powershell
docker compose ps
```

`api`, `runner`, `market-ingest`, and `news-worker` are separate containers. Stopping
`runner` leaves the API healthy and charts live; queued work simply waits.

### B. Long-running workload handling

Covered by [`PROOF-CONTROL-001`](../validation/evidence/PROOF-CONTROL-001.md): all three
stop conditions, pause, resume, and cancel converge to a settled durable state and
survive a restart.

One real lease expiry is recorded in the stored attempt history, which is the recovery
path working on real data rather than in a test:

```text
runner_id 37b9e11d-…-1   claimed 2026-09-03 09:17:36Z
                          completed 2026-09-03 10:37:40Z
                          failure_reason BACKTEST_LEASE_EXPIRED
```

The runner holding that claim stopped. The claim expired, the stale-claim sweep
reclaimed the work, and the attempt was closed with an explicit reason instead of being
lost or silently duplicated.

### Measured backtest duration

Per-attempt duration is stored for every attempt ever run, so this needs no
instrumentation:

```sql
SELECT count(*) AS attempts,
       round((extract(epoch from min(completed_at - claimed_at))*1000)::numeric,0) AS min_ms,
       round((extract(epoch from percentile_disc(0.5)
             WITHIN GROUP (ORDER BY completed_at - claimed_at))*1000)::numeric,0) AS p50_ms,
       round((extract(epoch from percentile_disc(0.95)
             WITHIN GROUP (ORDER BY completed_at - claimed_at))*1000)::numeric,0) AS p95_ms,
       round((extract(epoch from max(completed_at - claimed_at))*1000)::numeric,0) AS max_ms
FROM experiment.backtest_attempts
WHERE completed_at IS NOT NULL AND failure_reason IS NULL;
```

| Population | Attempts | min | p50 | p95 | max |
|---|---|---|---|---|---|
| All successful attempts ever recorded | 218 | 430 ms | 1024 ms | 3321 ms | 5041 ms |
| The six runs recorded below | 84 | 424 ms | 819 ms | 1858 ms | 2077 ms |

Failed attempts are excluded from the duration statistics on purpose: a lease expiry
measures an outage, not compute cost.

### C and D. Scaling the runner by configuration only

The runner replica count was changed with one command. No source file, no job contract,
and no database schema changed between the two configurations:

```powershell
docker compose up -d --scale runner=3 --no-recreate   # scale out
docker compose up -d --scale runner=1 --no-recreate   # scale back
```

Each configuration ran the same 24-candidate workload three times, each with a distinct
seed, using:

```powershell
node scripts/measure-backtest-scale.mjs runner-3 24 <distinct-seed>
```

Wall-clock time for 24 candidates, end to end:

| Runner replicas | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| 1 | 14890 ms | 14548 ms | 10797 ms | 14548 ms |
| 3 | 10924 ms | 8845 ms | 9802 ms | 9802 ms |

**The decisive evidence is not the wall-clock number, it is the work distribution.**
During the three-replica window, three independent runner processes claimed work from
the same PostgreSQL queue:

```sql
SELECT runner_id, count(*) AS attempts,
       min(claimed_at)::time(0) AS first_claim,
       max(completed_at)::time(0) AS last_done
FROM experiment.backtest_attempts
WHERE claimed_at > now() - interval '40 minutes'
GROUP BY 1 ORDER BY min(claimed_at);
```

| runner_id | attempts | first claim | last done |
|---|---|---|---|
| `0136a2d5-…-1` | 61 | 02:45:46 | 02:47:31 |
| `c2b9eaf4-…-1` | 12 | 02:46:18 | 02:46:54 |
| `206dedbb-…-1` | 11 | 02:46:22 | 02:46:54 |

Two of those processes did not exist when the workload started. They were added by
`--scale`, joined the same queue, and began claiming work without any coordination step.

Correctness held while sharing the queue:

```sql
SELECT count(*) FROM (
  SELECT run_id FROM experiment.backtest_attempts
  WHERE failure_reason IS NULL AND completed_at IS NOT NULL
  GROUP BY run_id HAVING count(*) > 1) x;              --  0

SELECT count(*), count(DISTINCT idempotency_key)
FROM experiment.backtest_runs;                          --  302, 302
```

No backtest run has more than one successful attempt, and every run has a distinct
content-derived idempotency key.

## What is safely claimable

- Backtests never run on the API or WebSocket path.
- Backtest duration is recorded durably per attempt and can be queried at any time.
- Worker count is a deployment configuration change, not a code change. Adding replicas
  required no source edit and no job-contract change.
- Multiple runner processes share one PostgreSQL-backed queue without producing a
  duplicate logical result.
- Backpressure (`maxInFlight`) bounds in-flight work, so the backlog cannot grow without
  limit.
- A lost runner does not lose work: the claim expires and the work is reclaimed.
- On the machine above, three replicas completed the same workload faster than one
  (median 9802 ms against 14548 ms).

## What is NOT claimed

- **No linear scaling.** Three replicas gave roughly 1.5x, not 3x. The two
  configurations' timing ranges overlap (one-replica best 10797 ms, three-replica worst
  10924 ms). With three runs per configuration on a contended laptop, this establishes a
  direction, not a scaling factor.
- **No 100,000-candidate capacity.** The largest workload measured is 24 candidates.
- **No throughput figure**, no candidates-per-second, and no capacity projection.
- **No bottleneck analysis.** Where saturation occurs was not identified, so
  `PROOF-SCALE-001` remains unsatisfied; see below.
- **No BullMQ measurement of any kind.** V6 is not implemented. Nothing here says
  anything about queue depth, dispatcher lag, broker retries, or duplicate delivery.
- **No latency SLO** and no production performance guarantee.
- **No claim about other hardware.** One machine, one run set, one dataset window.

### Relationship to PROOF-SCALE-001

[`PROOF-SCALE-001`](../validation/architecture-proof-plan.md) is a V6 proof. It requires
BullMQ queue depth and job-state counts, enqueue/consume rates, stalled-job and
duplicate-delivery counts, Redis persistence health, and a scale-up until a bottleneck
is observed. **This document does not satisfy it and does not claim to.**

What it does provide is the part of that proof that the V5 PostgreSQL-executor
realization can honestly support today: worker count is a deployment change rather than
a code change, backpressure bounds in-memory growth, and no duplicate logical result
appears when replicas share the queue. `PROOF-SCALE-001` stays open.
