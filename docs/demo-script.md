# Demo script

The numbered walkthrough for the certified V1-V4 baseline. This is the script a
person follows to show each version end to end on the full-system Compose topology
(see the README's "Full-system integration and demo path"). Each version updates it
as part of `DEMO-01`.

Current certified baseline: **V1 through V4**, frozen at `v4.0-demo`. Repository
product authorization is now **V5**; this evidence script records what is certified
and does not advance it. The V5 walkthrough below is validated (both isolation
proofs pass on this topology; see
[`PROOF-ISO-001.md`](validation/evidence/PROOF-ISO-001.md) and
[`PROOF-ISO-002.md`](validation/evidence/PROOF-ISO-002.md)) but V5 itself is not
yet frozen — that tag is an explicit owner decision. Demo scenario sources are in
[`implementation-plan/VERSIONS.md`](../implementation-plan/VERSIONS.md).

## Before you start

1. From a clean checkout, copy the environment file and set real build-identity
   values (`DEPENDENCY_LOCK_HASH` as a 64-character SHA-256 hex, plus
   `APPLICATION_COMMIT` and `WORKER_COMMIT`):

   ```powershell
   cp .env.example .env
   ```

2. Bring up the whole topology with one command and wait until it is healthy:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

   You should see `postgres` healthy, `migrate` exited with code 0, `api`
   healthy, `runner`, `market-ingest`, `news-worker`, and `web` up, and `redis`
   healthy. BullMQ and an outbox dispatcher are not present; they belong to V6.

3. Load the demo market data:

   ```powershell
   docker compose exec api pnpm run demo:seed
   ```

   Every page opens on a window derived from the current time: Realtime shows the
   last 150 closed candles per timeframe, and Backtest, Strategy Engine, and
   Discovery each open on a recent range. This command loads 30 days of BTCUSDT
   candles at 5m, 15m, 1h, and 4h, which covers all of them.

   Run it before opening the SPA. Without it the pages are not broken, they are
   empty: each one correctly reports that it has no candles for the window it
   asked for. If you would rather load a specific range, the underlying CLI still
   takes one directly:

   ```powershell
   docker compose exec api pnpm run market:backfill -- --symbol BTCUSDT --timeframe 1h --startTime <ms> --endTime <ms>
   ```

4. Open the SPA at <http://localhost:8080> and go to the Discovery page.

## V5 News and Sentiment walkthrough

1. Start the full topology, including `news-worker`, as in "Before you start".
   Open the News page. Collected items list with source, publish time, and
   related coins.
2. Show the sentiment distribution over the last window and the analyzed item
   count.
3. Stop the news worker (`docker compose stop news-worker`). The News page
   reports collection degraded; no other page is affected.
4. Switch to Realtime — charts still stream. Run a backtest — it still
   completes. Run a discovery loop — it still ranks. This is the isolation
   claim `PROOF-ISO-001` proves in full detail, including recovery after
   `docker compose start news-worker`.
5. Configure the news worker with an unreachable model credential. Collection
   keeps storing items; analysis health goes degraded and failed attempts are
   recorded with a generic reason, never a raw provider/model detail. This is
   the isolation claim `PROOF-ISO-002` proves in full detail, including the
   durable retry once the model is reachable again.
6. Run a technical-only backtest (no sentiment-series strategy) and confirm its
   result records `newsInput` as not applicable — the sentiment port is never
   called for a descriptor that does not declare it.
7. Show the architecture point: the collector never calls the sentiment model,
   and no strategy imports the News repository, provider, or analyzer
   directly — only the durable `SentimentFeature` query, applying its
   configured missing/stale policy.

Full evidence, including exact commands and durable identities, is in
[`PROOF-ISO-001.md`](validation/evidence/PROOF-ISO-001.md) and
[`PROOF-ISO-002.md`](validation/evidence/PROOF-ISO-002.md).

## V4 Realtime Market Data walkthrough

1. Open the Realtime page. Confirm four BTCUSDT charts run at `5m`, `15m`, `1h`,
   and `4h`. A forming candle moves through live ticks and closed candles remain in
   the durable series.
2. Change chart 1 to `1m`. Only chart 1 receives a new snapshot. Charts 2 to 4
   keep their candles and live updates, and the page does not reload.
3. Run the controlled provider outage browser check:

   ```powershell
   pnpm run smoke:mkt09
   ```

   It recreates only `market-ingest` with the tracked provider-host override,
   checks `healthy -> degraded -> healthy`, keeps four subscriptions on the same
   page, and restores the normal Compose definition even when it fails.
4. Confirm recovery is complete through the Market read endpoint over the outage
   range. It must report `resolved: true`, no gaps, and matching expected and
   present candle counts. The release evidence shows an example command and range.
5. Reload the Realtime page. Each chart must return a PostgreSQL snapshot before
   live continuation; it must not rely on Redis replay.
6. Show the Redis boundary with the focused smoke:

   ```powershell
   pnpm run smoke:ws03
   ```

   It restarts the API and verifies fresh snapshots, including while Redis is
   stopped. Redis stops live push, but it never becomes candle durability truth.

For repeatable four-chart isolation and forming-tick checks, run:

```powershell
pnpm run smoke:mkt11
```

## V1 regression walkthrough

1. Open the Backtest page. Select BTCUSDT, `1h`, the backfilled 2024 window,
   and the moving-average strategy. Set a fast period smaller than the slow
   period.
2. Start the backtest. Observe `queued`, `running`, then `completed`; a failure
   must show its server reason instead of leaving the page running forever.
3. Confirm the result shows total return, win rate, maximum drawdown, number of
   trades, the execution assumptions, chart annotations, and paged trades.
4. Run the same configuration again and compare the trade list and frozen
   specification hash.
5. Start another run and stop only the API with `docker compose stop api`.
   The separate runner must complete the run. Start the API again with
   `docker compose start api` and read the completed result.

## V2 regression walkthrough

1. Open Realtime. Confirm four real BTCUSDT charts render at `5m`, `15m`, `1h`,
   and `4h`. Change only chart 1; the other three must not reload or change.
2. Open Strategy Engine. Select at least two catalog strategies, enter valid
   schema-driven parameters and weights, choose a combination policy, and set a
   backfilled data window.
3. Save the composite. The combined signal must come from the backend response;
   there is no simulated-signal control in the page.
4. Return to Backtest, select the saved composite, and run it through the same
   frozen-specification and runner path as a built-in strategy.
5. Click one trade, then another. The chart must replace the entry/exit
   highlight and move to that trade. Use Clear selection and confirm the
   highlight is removed.

## V3 walkthrough

1. **Configure the run.** Set the dataset to BTCUSDT, `1h`, and the window you
   backfilled. Choose the `random-search` generator from the selector (the list
   is fed by the generator catalog, not hard-coded). Set the search space to one
   or more single strategies (for example moving average, Bollinger bands,
   support/resistance). Set a candidate limit as the stop condition and a seed.

2. **Press start.** The candidate counter rises as candidates are generated,
   backtested by the separate runner process, and evaluated. The Top-K
   leaderboard fills and reorders as better candidates are accepted. Every number
   comes from durable backend state; the page counts nothing itself.

3. **Pause, then resume.** Press pause. New dispatch stops and, once the
   in-flight candidate drains, the page shows the converged `paused` state (not an
   optimistic one). Press resume; the run continues from where it stopped, with no
   duplicated candidate.

4. **Restart the API mid-run.** In another terminal, restart just the API
   process:

   ```powershell
   docker compose restart api
   ```

   The run state survives, because it lives in PostgreSQL, not in the API
   process. The runner is a separate process and keeps working while the API is
   down. When the API is back, the page reads the same run and continues. This is
   the architecture point: run control is durable and the runner is independent.

5. **Let a stop condition fire.** When the candidate limit is reached, the run
   stops and the page shows why (stop reason `max-candidates`). The duration-limit
   and no-improvement stop conditions work the same way.

6. **Open the top entry.** Click the top leaderboard row. Its trades, its chart
   overlays (drawn from stored annotation primitives), and its four metrics
   appear. The chart is drawn over the run's own dataset window.

7. **Read the provenance.** Open the entry's provenance record and read the
   reproducibility checklist: the engine and its version, the runner attempt, the
   immutable dataset snapshot with its integrity hash, and the frozen
   specification. Every leaderboard row resolves back to its result and its spec.

8. **Show reproducibility.** The same seed and search space produce the same
   candidate sequence across two runs, and rerunning the recorded specification
   reproduces the same result. The stored trade content hash in the provenance
   record is what a rerun must match.

9. **Show the architecture point.** The generator is selectable, and the
   backtester, evaluator, ranking policy, and leaderboard know nothing about how a
   candidate was produced. A second generator (`grid-search`) is already in the
   selector, added through the generator port with no downstream change.

## When you are done

```powershell
docker compose down
```

Data persists in the `postgres_data` volume across `down` / `up`; add `-v` only
to delete it.
