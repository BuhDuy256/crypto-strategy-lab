# PROOF-ISO-001 - News Failure Isolation Evidence

## Result

**PASS** on 2026-09-01. A full source-image V5 Compose topology kept four live
market chart subscriptions, a technical-only backtest, and a ranked discovery
run working while the separate News worker was stopped. After one full collection
poll interval without a heartbeat, the News health endpoint reported
`collection.status=degraded` with `message=worker-stale`. Restarting only the
News worker returned collection health to `healthy` and retained the collected
items.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-4.1 -> QA-ISO-001 -> D-10 -> ADR-007.
- Proof definition: `docs/validation/architecture-proof-plan.md`,
  `PROOF-ISO-001`.
- Relevant decision: `ADR-007-news-sentiment-isolation.md`.

## Code, build, and environment identity

- Base commit: `d02318bd160970136cb032d2ceb3fdb4e589d96a` on
  `v5-news-and-sentiment`.
- Version tag: none. The proof ran on the uncommitted V5 certification worktree;
  no commit, push, or tag was created.
- Worktree diff Git object: `e9cfe12c408805a62aff632bf63246cc03ba4559`.
- `pnpm-lock.yaml` SHA-256:
  `2def83389247e1c769c6f1ca7c619abdc96286fef4201850d2fceeeae9ffa305`.
- `docker-compose.yml` SHA-256:
  `dadf691f047aa5f59cd73194d772c855cd2e78739607f05394178743226f1535`.
- Proof-plan SHA-256:
  `4eb36d4608948bf28552f637934d81179131c3422a733a707a60316538998610`.
- Docker Desktop Engine 29.6.1, Linux containers, 12 assigned CPUs and
  8,166,985,728 bytes assigned memory.
- Host: Windows, 13th Gen Intel Core i7-1355U, 10 cores / 12 logical processors,
  16,857,645,056 bytes memory. Node.js v22.19.0.
- Source-built backend image: `b96c130810c1`; source-built web image:
  `dfc5593f9eb4`. PostgreSQL was `postgres:16-alpine`; Redis was
  `redis:7.4-alpine`.

## Topology and durable baseline

The proof started with:

```powershell
docker compose up --build -d
```

The V5 Compose topology had `postgres`, `migrate`, `redis`, `api`, `runner`,
`market-ingest`, `news-worker`, and `web`. `migrate` reported
`nothing to apply, database already up to date`; the protected demo migration
ledger already contained all source migrations through
`0018_create_news_collection_worker_heartbeat.sql`.

Before failure injection, the real configured CoinDesk source collected 13 new
items and skipped 12 duplicates. Analysis completed its claimed items. API and
News health were healthy.

The proof opened one Socket.IO client to `http://localhost:3000` with path
`/ws`, websocket transport, and four distinct subscriptions:

- `proof-chart-1`: `BTCUSDT` `5m`
- `proof-chart-2`: `BTCUSDT` `15m`
- `proof-chart-3`: `BTCUSDT` `1h`
- `proof-chart-4`: `BTCUSDT` `4h`

The monitor ran from `2026-09-01T10:53:52.743Z` to
`2026-09-01T11:10:52.765Z`. It received all four durable snapshots, remained
connected, and reported no Socket.IO or market errors throughout the outage and
recovery. The API status endpoint reported four active subscriptions while the
monitor was live.

## Failure injection and isolated work

The News process alone was stopped with:

```powershell
docker compose stop news-worker
```

Its graceful stop log was recorded at `2026-09-01T10:54:24.142Z`. The API,
runner, market-ingest, Redis, and web containers stayed running. The collection
health status stayed healthy until the configured 15-minute poll interval had
elapsed, which is the expected heartbeat policy. At
`2026-09-01T11:06:13.588Z`, the API returned:

```json
{
  "collection": [{ "status": "degraded", "message": "worker-stale" }],
  "analysis": { "status": "healthy" }
}
```

While the News worker was stopped, a technical-only moving-average backtest
completed successfully:

- Specification: `cdec15f4-daef-4299-8dd1-b0e775a2b979`.
- Run: `42049877-161d-4663-b1cf-b9aa25edf627`.
- Dataset: durable `BTCUSDT` `1h` candles, range
  `1788170400000` through `1788253200000`, 24 candles.
- Strategy: `moving-average@1.0.0`, `fastPeriod=10`, `slowPeriod=20`,
  `priceSource=close`.
- Metrics: `totalReturn=-0.003406185826000001`,
  `maximumDrawdown=0.003406185826000001`, `numberOfTrades=1`, `winRate=0`.
- Provenance recorded `newsInput.status=not-applicable`.

Also during the outage, a real discovery run completed and ranked:

- Search specification: `e9cbf226-6ace-4c56-bc02-cdd2dd6aeb55`.
- Dataset: existing durable `BTCUSDT` `1m` candles, range
  `1788173880000` through `1788260220000`, 1,440 candles. No seed, reset, or
  backfill command was used for this proof.
- Generator: `random-search@1.0.0`; search space: `moving-average@1.0.0`;
  `maxInFlight=1`.
- Result: `stopped` with `stopReason=exhausted`, 4 generated, 4 submitted,
  4 completed, 0 failed, and 4 leaderboard entries.

An earlier one-hour discovery fixture completed but produced no board entries.
This was investigated before changing the fixture: the projector had recorded
the applied version, and the candidate had one closed trade while the frozen
ranking policy requires `minTrades=5`. It was correctly ineligible, not a
projection failure. The final one-minute fixture produced ranked entries.

## Recovery and conclusion

Recovery used only:

```powershell
docker compose start news-worker
```

At `2026-09-01T11:06:42.625Z`, the restarted worker collected zero new items and
skipped 25 duplicates, then collection health returned to `healthy`. Binance
provider health remained healthy. The web root returned HTTP 200.

The proof used the protected Compose database only for normal application
operations required by the proof. It did not reset, reseed, drop, or modify the
migration ledger. The temporary `csl_test_v5_certification` database was not used
because its expected guard-marker schema was not present at the preflight check.

The failure was contained in the News worker and its public health read. Market
charts, technical backtesting, and discovery remained operational, so
`PROOF-ISO-001` passes.
