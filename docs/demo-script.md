# Demo script

One coherent oral-defense walkthrough of the system as it exists now. It tells a
single story instead of touring pages independently: market data feeds strategy
work, strategy work feeds a backtest, and automated composite discovery — the
newest capability — produces a leaderboard entry whose provenance can be traced
back to a frozen specification. News and sentiment are demonstrated separately,
as an isolated capability, at the end.

Certified baseline: **V1 through V5**, tag `v5.0-demo`, commit `2b751f0`.
Generated-composite execution (`FIN-01`) and its Discovery exposure (`FIN-02`)
close the one functional gap that baseline had; presentation hardening (`FIN-03`)
is the demo-visible state below. **V6** (BullMQ-based execution, the
transactional outbox, and the scale/retry/duplicate/observability proofs) is not
implemented and is not part of this demo.

Architecture statements below are limited to the claimable set in
[`frozen_implementation_plan/README.md`](../frozen_implementation_plan/README.md#c-architecture-demoable)
section C. Nothing about queue scaling, candidate throughput, the outbox, broker
retry, duplicate-delivery safety, or latency is claimed anywhere in this script.

Known limitations and the full list of claims this demo must not make are in
[`final-defense-notes.md`](final-defense-notes.md) — read it before presenting.

## The one distinction to keep straight

| Thing | What it is |
|---|---|
| Built-in strategy | A system-global definition from the strategy registry |
| Saved composite strategy | A combination a person deliberately created and saved (step 3) |
| Generated candidate | A proposal Discovery's search produced for one run; never saved as a composite strategy (step 5) |
| Leaderboard entry | The evaluated outcome of a candidate, not the source of truth for its execution (step 6) |

A generated candidate is not a saved composite. Do not call one the other during
the demo.

## Pre-demo

1. **Topology.** From a clean checkout:

   ```powershell
   cp .env.example .env
   docker compose up --build -d
   docker compose ps
   ```

   Expect `postgres` and `redis` healthy, `migrate` exited 0, and `api`, `runner`,
   `market-ingest`, `news-worker`, `web` up. There is no BullMQ worker and no
   outbox dispatcher in this topology — that machinery belongs to V6.

2. **Dataset.** Seed the demo data before opening the SPA:

   ```powershell
   docker compose exec api pnpm run demo:seed
   ```

   This loads 30 days of BTCUSDT candles at `5m`, `15m`, `1h`, and `4h`. Without
   it, pages are not broken, they are empty for the window they ask for.

   Discovery's leaderboard only accepts candidates that clear its `minTrades: 5`
   ranking-eligibility gate. The 30-day, four-timeframe seed is normally enough
   for the `5m`/`15m` search space used in step 5. If the search space is changed
   to a longer timeframe or a shorter window, confirm at least a few candidates
   clear 5 trades before presenting live — a too-short window can silently
   produce zero ranking-eligible candidates and make Discovery look broken when
   it is only starved of data.

3. **Starting screen.** Open the SPA at <http://localhost:8080> and navigate
   directly to **Realtime** (`/realtime`). The app's default route is
   `/backtest`; that is unrelated to demo order.

## Canonical demo flow

### 1. Market / Realtime

- **ACTION:** On the Realtime page, point out the four charts. Change chart 1's
  timeframe.
- **VISIBLE BEHAVIOR:** Four independent BTCUSDT charts stream at `5m`, `15m`,
  `1h`, `4h` in a 2×2 grid; a forming candle updates live. Changing chart 1
  reloads only chart 1 — charts 2 to 4 keep streaming, untouched.
- **REQUIREMENT:** Multi-timeframe realtime market data.
- **ARCHITECTURE POINT:** Market data is normalized behind a provider port — a
  second provider needs no frontend change (`PROOF-PROVIDER-001`). Realtime
  recovery from a provider outage produces no gaps and no duplicates
  (`PROOF-RT-001`; it disclaims any latency target).
- **DEFENSE LINE:** "Every chart here reads a normalized candle contract, not a
  specific exchange's payload — that's what lets a provider fail or get swapped
  without the frontend ever knowing."
- *If time allows:* `pnpm run smoke:mkt09` recreates `market-ingest` under a
  provider outage and shows `healthy → degraded → healthy` while all four
  subscriptions stay open.

### 2. Strategy catalog

- **ACTION:** Open Strategy Engine. Show the list of selectable strategies.
- **VISIBLE BEHAVIOR:** The list is served from the backend's strategy registry,
  not hard-coded in the page.
- **REQUIREMENT:** A catalog of multiple technical strategies to choose from.
- **ARCHITECTURE POINT:** Adding a strategy needs no downstream change —
  proven with a real added strategy (`PROOF-EXT-001`).
- **DEFENSE LINE:** "Every strategy on this screen comes from one registry; a
  new one is added behind that contract with nothing downstream touched."

### 3. Manual composite

- **ACTION:** Select at least two catalog strategies, set schema-driven
  parameters and weights, choose a combination policy, set a backfilled window,
  and save.
- **VISIBLE BEHAVIOR:** A saved composite strategy is created; its combined
  signal comes from the backend response, not a frontend simulation.
- **REQUIREMENT:** Deliberate combination of multiple strategies into one
  tradeable definition.
- **DEFENSE LINE:** "This composite is something I built and saved on purpose —
  keep that in mind, because what Discovery produces automatically in step 5 is
  a different thing."

### 4. Backtest

- **ACTION:** Open Backtest, select the saved composite, and run it.
- **VISIBLE BEHAVIOR:** `queued → running → completed`; the result shows total
  return, win rate, maximum drawdown, trade count, chart annotations, and a
  paged trade table.
- **REQUIREMENT:** Backtesting with the required metric set and trade
  visualization.
- **DEFENSE LINE:** "A saved composite runs through the exact same backtest path
  as a built-in strategy — nothing about it is special-cased."

### 5. Automated composite Discovery — give this real attention

- **ACTION:**
  a. Open Discovery. Set the search space to two or more single strategies.
  b. Set **composite size greater than 1** and pick the generator from the
     selector (not hard-coded — `random-search` is shown; `grid-search` exists
     in the same selector).
  c. Start the run.
- **VISIBLE BEHAVIOR:** The candidate counter rises as the generator produces
  **composite** candidates (the composite-size control takes one value, so
  every candidate in this run is a composite of that size); each is backtested
  by the separate runner process and evaluated; the Top-K leaderboard fills and
  reorders, entirely with composite entries. Every number is durable backend
  state — the page counts nothing itself. Leaving composite size at 1 instead
  runs the same path with single-strategy candidates only, exactly as it did
  before this release.
- **REQUIREMENT:** Automated search, extended to composite candidates under the
  accepted requirement reading (`FIN-01`/`FIN-02`) — search must not be limited
  to single strategies.
- **ARCHITECTURE POINT:** The generator is swappable behind a port with no
  downstream change (`PROOF-REPLACE-001`). Pause, resume, and a mid-run restart
  of the API all survive because run state lives in PostgreSQL, not in the API
  process (`PROOF-CONTROL-001`, PostgreSQL-executor realization).
- **Live restart, while the run is still active:**

  ```powershell
  docker compose restart api
  ```

  The page keeps reading the same run once the API is back; no candidate is
  duplicated or lost.
- **DEFENSE LINE:** "This is the new piece — Discovery isn't just searching
  single strategies anymore, it's searching combinations, and the run survives
  losing the API mid-search because the API was never its source of truth."

### 6. Leaderboard

- **ACTION:** Point out a composite entry in the Top-K leaderboard.
- **VISIBLE BEHAVIOR:** Entries are ranked candidates, identifiable as generated
  composites (this run's leaderboard is fresh and composite-only, since step 5
  fixed the search to one composite size greater than 1).
- **REQUIREMENT:** Ranked Top-K results from the search.
- **DEFENSE LINE:** "The leaderboard is a projection of evaluated candidates —
  it's an output, not where the experiment actually executes."

### 7. Provenance — one of the strongest architecture points

- **ACTION:** Click the composite leaderboard entry, then open its provenance
  record.
- **VISIBLE BEHAVIOR:** The record shows the engine and its version, the runner
  attempt, the immutable dataset snapshot with its integrity hash, and the
  frozen experiment specification the candidate ran under.
- **REQUIREMENT:** Every result must trace back to a complete, immutable
  experiment specification.
- **ARCHITECTURE POINT:** A leaderboard entry resolves to its frozen
  specification and reruns identically (`PROOF-REP-001`) — proven for
  single-strategy candidates on the certified baseline, and re-proven for a
  **generated composite** candidate at the final certification gate (`FIN-06`).
- **DEFENSE LINE:** "This isn't just a score — it's a pointer back to the exact
  frozen inputs that produced it, and re-running that specification reproduces
  the same trades."

### 8. News / Sentiment isolation

- **ACTION:** Open News. Show the collected items and the sentiment
  distribution. Then stop the news worker:

  ```powershell
  docker compose stop news-worker
  ```

- **VISIBLE BEHAVIOR:** News reports collection degraded. Switch to Realtime —
  charts still stream. Run a backtest — it still completes. This is isolation,
  not a coincidence.
- **REQUIREMENT:** News collection and sentiment classification, isolated from
  core trading capability.
- **ARCHITECTURE POINT:** News-worker failure does not stop charts, backtests,
  or discovery (`PROOF-ISO-001`). A technical-only backtest records `newsInput`
  as not applicable — the sentiment port is never called for a strategy that
  does not declare it.
- **DEFENSE LINE:** "News can fail completely and the trading side of the
  system never notices — that boundary is enforced by a query the strategy has
  to explicitly ask for, not by hoping nothing breaks."
- *If time allows:* restart the worker (`docker compose start news-worker`) to
  show recovery, then point a model credential at an unreachable endpoint to
  show analysis go degraded while collection keeps storing items
  (`PROOF-ISO-002`) — failures are recorded with a generic reason, never a raw
  provider/model detail.

## When you are done

```powershell
docker compose down
```

Data persists in the `postgres_data` volume across `down`/`up`; add `-v` only to
delete it.

## Further evidence

Full commands and durable identities for the proofs referenced above are in
[`validation/evidence/PROOF-REP-001.md`](validation/evidence/PROOF-REP-001.md)
(single-strategy and generated-composite instances),
[`validation/evidence/PROOF-RT-001.md`](validation/evidence/PROOF-RT-001.md),
[`validation/evidence/PROOF-ISO-001.md`](validation/evidence/PROOF-ISO-001.md),
and
[`validation/evidence/PROOF-ISO-002.md`](validation/evidence/PROOF-ISO-002.md).
