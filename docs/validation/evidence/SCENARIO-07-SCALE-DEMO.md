# Scenario 07 — Backtest concurrency and runner-scale demo

## Scope and status

This is a recorded V5 demonstration for the submission checklist scenario “scale the
number of backtests.” It proves that the current PostgreSQL-backed runner can be
scaled by deployment configuration, that multiple runner processes share work, and
that completed work does not gain a second successful attempt.

It is **not** `PROOF-SCALE-001`. That formal V6 proof requires the future BullMQ
transport, broker metrics, saturation/bottleneck analysis, and an agreed higher-scale
workload.

## Environment

| Item | Value |
|---|---|
| Date | 2026-09-04, Asia/Ho_Chi_Minh |
| Source commit | `0fd2a3d` |
| Topology | Local Docker Compose: API, PostgreSQL, Redis, market ingest, news worker, web, and runner |
| Dataset | Binance `BTCUSDT`, `1h`, 30-day window ending `2026-09-03T20:00:00Z` |
| Generator | `random-search` over Moving Average, RSI, Bollinger Bands, and MACD |
| Stop condition | 24 generated candidates per search |
| Backpressure bound | `maxInFlight: 8` |
| Per-runner concurrency | `BACKTEST_RUNNER_CONCURRENCY=1` (default) |

The controlled workload was started by the existing reproducible measurement script:

```powershell
node scripts/measure-backtest-scale.mjs <label> 24 <fresh-seed>
```

Fresh seeds were used because reusing a seed would intentionally reuse existing
idempotent work and would not measure a new search.

## Procedure

1. Build the current commit and run exactly one `runner` replica.
2. Run the 24-candidate workload three times with distinct seeds.
3. Scale the same Compose service to three replicas without changing source, contract,
   or database schema.
4. Run the equivalent workload three times with distinct seeds.
5. Query durable attempt records for timing, runner distribution, and successful-attempt
   duplicates.
6. Restore Compose to one runner replica after the measurement.

Commands used for the topology change:

```powershell
docker compose up -d --build --scale runner=1
docker compose up -d --scale runner=3 --no-recreate
docker compose up -d --scale runner=1 --no-recreate
```

## Observed search completion

Every search reached `stopped / max-candidates`, submitted 24 candidates, completed
24 candidates, and reported zero failed candidates.

| Runner replicas | Run 1 | Run 2 | Run 3 | Median |
|---|---:|---:|---:|---:|
| 1 | 13,552 ms | 8,892 ms | 8,863 ms | 8,892 ms |
| 3 | 8,431 ms | 7,866 ms | 7,809 ms | 7,866 ms |

The three-replica configuration was faster in this local run. It is not a linear-scale
or throughput claim: this is one development machine, the timing ranges overlap, and
the workload is intentionally small.

## Durable execution evidence

The attempt query used `DISTINCT (run_id, attempt_number)` because a structurally
identical random candidate may correctly reuse a pre-existing idempotent backtest run
across search experiments. Candidate reuse is not a duplicate execution.

| Group | Unique successful attempts | p50 attempt duration | p95 attempt duration |
|---|---:|---:|---:|
| 1 runner | 49 | 460 ms | 588 ms |
| 3 runners | 48 | 600 ms | 779 ms |

During the three-runner window, all three independent runner IDs claimed work from the
same PostgreSQL queue, with 31, 10, and 7 successful attempts respectively. The query
found **0** runs with more than one successful attempt.

The relevant query shape is:

```sql
SELECT run_id
FROM experiment.backtest_attempts
WHERE completed_at IS NOT NULL AND failure_reason IS NULL
GROUP BY run_id
HAVING count(*) > 1;
```

## What this demonstrates

- CPU-heavy backtests are outside the API process, in the dedicated `runner` role and
  a worker thread.
- Adding runner replicas is a Docker Compose deployment change, not a domain-code or
  job-contract change.
- Multiple runner processes can claim from the same durable PostgreSQL queue.
- `maxInFlight: 8` bounds the coordinator's in-flight work.
- The observed shared queue did not produce a duplicate successful result.

## What this does not demonstrate

- No capacity statement for 100,000 candidates.
- No throughput SLO, linear scaling factor, or cross-machine benchmark.
- No BullMQ, Redis queue-depth, outbox, inbox, broker retry, or bottleneck evidence.
- No closure of `PROOF-SCALE-001`.

For the broader earlier small-scale measurement and its limitations, see
[`evidence-performance-and-scale.md`](../../evidence/evidence-performance-and-scale.md).
