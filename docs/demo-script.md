# Demo script

The numbered walkthrough for the certified V1-V3 baseline. This is the script a
person follows to show each version end to end on the full-system Compose topology
(see the README's "Full-system integration and demo path"). Each version updates it
as part of `DEMO-01`.

Current certified baseline: **V1 through V3**. Repository product authorization
remains **V2**; this evidence script does not advance it. Demo scenario sources are in
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
   healthy, and `runner` and `web` up. No Redis, BullMQ, or news service is
   present; V3 does not use them.

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
