# PROOF-RT-001 - Realtime Recovery and Chart Isolation Evidence

## Result

**PASS** on 2026-08-30 against the final V4 Compose topology. Four independent
chart subscriptions remained isolated, a controlled provider outage recovered from
durable PostgreSQL state, and Redis failure did not prevent a closed candle from
committing.

No numeric end-to-end latency budget has been accepted for this project. This run
records a repeatable Redis-to-browser delivery baseline, but does not claim that a
provider-to-browser latency SLO has passed.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-3.* -> QA-REL-001 / QA-RT-001 -> D-03 / D-07 -> ADR-003 / ADR-008.
- Proof definition: `docs/validation/architecture-proof-plan.md`, `PROOF-RT-001`.
- V4 contract: `implementation-plan/VERSIONS.md`, "V4 - Realtime Market Data".

## Code and build identity

- Base implementation commit:
  `4e00730fca83e68c0e82d042f4347417d7dddb0c`
  (`feat(market): complete gap recovery and provider health (MKT-09)`).
- Runtime `APPLICATION_COMMIT` and `WORKER_COMMIT` were both
  `4e00730fca83e68c0e82d042f4347417d7dddb0c`.
- pnpm lock SHA-256:
  `943d1bfe50e6ac3e432cfeb93a50c3c4836d4e186bb02ebdbcd6b956c5e8d7b2`.
- Backend image:
  `sha256:50700acaf0acc37b31dbb98e41c5518589d3d5b7548c2a0fc977ed10b9236533`.
- Web image:
  `sha256:e44ebc79e82321d94e273a80ab5a281981776416e022b3bfac2c80688c8aeb5b`.
- The later freeze commit will include this evidence record, the stale schema test
  expectation repair, the updated snapshot reference, and the smoke latency output.
  No tag existed during this proof run.

## Environment and fixture identity

- OS: Microsoft Windows 11 Home Single Language, build 26200.
- CPU: 13th Gen Intel Core i7-1355U, 10 cores, 12 logical processors.
- Memory: 16,857,645,056 bytes.
- Node.js: v22.19.0. pnpm: 9.15.9.
- Docker Engine: 29.6.1. Docker Compose: v5.1.4.
- Services: PostgreSQL 16 Alpine healthy, Redis 7.4 Alpine healthy, API healthy,
  web running, market-ingest running, runner running, and migrate exited 0.
- Demo seed at 2026-08-30T03:04:20.614Z: BTCUSDT 5m 8,641 candles, 15m
  2,881, 1h 721, and 4h 181.
- Pre-outage dataset snapshot: BTCUSDT 1m range
  `[1788058980000, 1788059100000]`, 3 candles, no gaps, revision watermark
  12428, integrity hash
  `1378366542995a572d63039235866f2759f85db32b53f3e338424e6a39d00267`.

## Commands

```powershell
docker compose up --build -d --force-recreate
docker compose exec -T api pnpm run demo:seed
pnpm run smoke:mkt11
pnpm run smoke:mkt09
pnpm run smoke:ws03
```

The controlled recovery used the tracked provider-only override:

```powershell
docker compose -f docker-compose.yml -f .scratch/mkt09/outage.yml up -d --no-deps --force-recreate market-ingest
docker compose up -d --no-deps --force-recreate market-ingest
```

The override blackholes only the Binance stream and REST hosts for `market-ingest`.
PostgreSQL, Redis, API, web, and runner stay up.

## Evidence by proof step

### 1. Four subscriptions and isolated timeframe change

`pnpm run smoke:mkt11` passed on the assembled browser path.

- The Realtime page opened `chart-1` through `chart-4` with four distinct
  subscription IDs and the initial `5m`, `15m`, `1h`, and `4h` timeframes.
- The API registry held exactly four subscriptions before and after the change.
- Changing chart 1 to `1h` gave only chart 1 a new snapshot. Charts 2 to 4 kept
  their snapshot counts, durable candles, forming candles, and later live updates.
- The browser marker survived, proving there was no full-page reload.
- Closing the page released every subscription, leaving the registry at zero.

The smoke also published forming ticks to every chart. Each receiving chart changed
only its forming state while its durable candle count stayed unchanged. This proves
an in-progress tick is not persisted as a closed candle.

### 2. Controlled disconnect, reconnect, recovery, and deduplication

`pnpm run smoke:mkt09` first observed browser health transition
`healthy -> degraded -> healthy` in 7,702 ms and 9,977 ms. The same page kept four
live subscriptions, retained its durable chart state, resumed live delivery, and did
not reload.

The longer provider-only outage began at `2026-08-30T03:07:36.767Z` and became
degraded at `2026-08-30T03:07:42.072Z` (5,305 ms). It remained degraded through
`2026-08-30T03:09:16.104Z`, crossing closed 1m intervals. Before restore, the
latest durable 1m candle was open time `1788059160000`. Provider restore started at
`2026-08-30T03:09:48.830Z`; health returned to healthy at
`2026-08-30T03:09:55.320Z` (6,490 ms), with durable data caught up through
`1788059280000`.

The Market-owned gap read returned this result for the outage range
`[1788059160000, 1788059280000]`:

```json
{
  "expectedCandleCount": 3,
  "presentCandleCount": 3,
  "gaps": [],
  "missingCandleCount": 0,
  "resolved": true
}
```

PostgreSQL contained the three closed candles at open times `1788059160000`,
`1788059220000`, and `1788059280000`, each at revision 1. The complete table had
zero duplicate logical identities and zero rows with revision above 1. The full
regression also passed the supervisor and reconnect-backoff tests, including the
increasing schedule with its 30-second ceiling.

### 3. Durable snapshot before live continuation

The pre-outage snapshot resolved after recovery to the identical integrity hash,
revision watermark 12428, three open times, and no gaps. Recovery therefore did not
rewrite the older dataset view.

`pnpm run smoke:ws03` passed with exit code 0. It restarted the API, observed fresh
snapshots for all four existing charts before continuing, stopped Redis, restarted
the API again, and observed fresh durable snapshots while Redis was unavailable.

### 4. Redis failure does not become durable truth

During the final Redis stop, the market-ingest process logged failed best-effort live
publication. At the same time, PostgreSQL 1m state advanced from 9 candles with
latest open time `1788059460000` to 10 candles with latest open time
`1788059520000`. Redis was then started again. This proves notification loss did not
block the authoritative closed-candle commit. The WS-03 smoke separately proved a
fresh browser snapshot remains correct while Redis is stopped.

## Delivery latency baseline

The final `smoke:mkt11` run measured the elapsed time from its deterministic Redis
publish call to the subscribed browser DOM observing the tick. Seven samples were
captured on the environment above:

| Samples | Min | P50 | P95 | Max |
|---:|---:|---:|---:|---:|
| 7 | 11.59 ms | 34.77 ms | 43.66 ms | 43.66 ms |

This is a delivery-path measurement, not a Binance event-time to browser-render
measurement. The project has no accepted numeric latency budget or provider clock
correlator yet, so it is retained as the baseline for later calibration rather than
a threshold claim.

## Deviations and follow-up

- No frozen architecture or ADR deviation was observed.
- Redis warnings during its intentional stop are expected evidence of at-most-once,
  best-effort delivery. PostgreSQL remained the correctness source.
- A future owner decision is needed before claiming a numeric end-to-end latency
  target: define the budget and the timestamp/clock method used to measure it.
