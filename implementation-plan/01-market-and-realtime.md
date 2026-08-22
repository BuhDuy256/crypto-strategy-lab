# 01 - Market Data and Realtime

Binance data behind a provider port, normalized candles owned by Market Data,
candlestick charts, four independent live subscriptions, disconnect recovery, and
the immutable datasets that experiments later run against.

Read [`README.md`](README.md) first. Statuses live in [`TRACKING.md`](TRACKING.md).

## Verified provider facts this area depends on

These come from the official Binance documentation and shape several slices. They
are technology capabilities, not project decisions.

| Fact | Consequence for this plan |
|---|---|
| `GET /api/v3/klines` takes `symbol`, `interval`, `startTime`, `endTime`, `limit`; `limit` defaults to 500 and its maximum is 1000 | Historical backfill of a long range must page. `MKT-02` owns paging. |
| A kline response row is a 12-element array: open time, open, high, low, close, volume, close time, quote volume, trade count, taker buy base, taker buy quote, ignore | The adapter maps positions to names. No positional array may leave the adapter. |
| Live kline stream name is `<symbol>@kline_<interval>`; the payload carries `t` open time, `T` close time, prices, `v` volume, and `x` "is this kline closed" | Only `x = true` may be persisted as a closed candle. `MKT-06` owns this. |
| One connection may listen to at most 1024 streams | Four charts are far inside the limit. One shared ingest connection is enough. |
| A connection to the stream endpoint is valid for 24 hours and will be disconnected at that mark; a `serverShutdown` event may also arrive | Reconnect and gap recovery are certain to run, not hypothetical. `MKT-09` must exist. |
| The server sends a ping frame every 20 seconds and disconnects if no pong arrives within a minute | The ingest client must answer pings. A silent client will be dropped. |
| Connection attempts are limited to 300 per 5 minutes per address | Reconnect must use backoff, not a tight retry loop. |

## MVP scope for this area

One pair (BTCUSDT) and the timeframe set `1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d`. Up to
four charts on screen, each with its own timeframe. Multiple coins and multiple
exchanges are extensions and are out of scope.

---

## MKT-01 - Normalized candle contract, provider port, and provider contract suite

**Outcome**
A framework-free `Candle` type, a `DatasetRef` type, a `MarketDataProvider` port,
and a reusable contract test suite that any provider adapter must pass. A fake
in-memory provider passes the suite.

**Why this slice exists**
The requirements ask directly how a second exchange is added without frontend
changes. The answer is this port plus this suite. Writing the suite before the
Binance adapter means the first adapter is written against a specification rather
than the specification being derived from whatever Binance happened to return.

**Dependencies**
`WS-01`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `Candle` identity is provider plus symbol plus timeframe plus open time; `DatasetRef` fields.
- [ADR-003](../docs/adr/ADR-003-provider-adapters.md): provider ports, normalized contracts, and a common conformance suite per provider.
- Official project source sections 4 and 6 (historical and realtime data, and the requirement that the frontend never depends on the Binance payload shape).

**Architecture constraints**
- `Candle` carries provider, symbol, timeframe, open time, close time, open, high,
  low, close, volume, and a closed or revision state.
- Candle identity is provider plus symbol plus timeframe plus open time.
- The contract lives in `market/domain` and imports no framework, no HTTP client,
  and no database library.
- Provider payloads never cross into Strategy, Experiment, or the frontend.
- Non-authoritative source metadata may be kept for diagnostics but must not be
  used in domain decisions.

**Expected change surface**
`market/domain` candle and dataset types, `market/application` provider port, a
shared contract test suite exported for reuse by future adapters, and a fake
provider used by tests.

**Acceptance criteria**
1. `Candle` and `DatasetRef` exist with the fields the baseline lists.
2. `MarketDataProvider` declares historical fetch, live subscription, and provider
   health.
3. The contract suite checks at least: timestamp alignment to the timeframe,
   OHLC invariants (high is the maximum, low is the minimum), non-negative volume,
   ascending open times with no duplicates, correct closed-state handling, and
   clear behaviour for an unsupported symbol or timeframe.
4. The fake provider passes the whole suite.
5. Running the suite against a deliberately broken fake fails with a message naming
   the violated rule.
6. Nothing in `market/domain` imports NestJS or an HTTP client, enforced by the
   boundary test.

**Validation**
Run the contract suite against the fake provider, and against a broken fake to
confirm each check fires.

**Out of scope**
Binance, persistence, gap recovery, dataset manifests, the live stream.

**Proof relevance**
Directly enables `PROOF-PROVIDER-001`. That proof runs this suite against a second
adapter.

---

## MKT-02 - Binance historical adapter

**Outcome**
`BinanceMarketDataProvider` fetches historical klines for a symbol, timeframe, and
time range, pages past the 1000-row response limit, and passes the `MKT-01`
contract suite unchanged.

**Why this slice exists**
The MVP needs Binance historical data, and backtesting needs ranges longer than one
response can carry.

**Dependencies**
`MKT-01`.

**Authoritative references**
- [ADR-003](../docs/adr/ADR-003-provider-adapters.md): the adapter translates source-specific behaviour into validated normalized contracts.
- The verified provider facts table at the top of this file.
- Official project source section 4.

**Architecture constraints**
- The adapter lives in `market/infrastructure` and implements the port from
  `market/application`.
- The positional 12-element response array is mapped inside the adapter. No
  positional array leaves it.
- Rate-limit and error behaviour is handled here, not by callers.
- Timestamp and timeframe normalization errors can create silent gaps or
  look-ahead bias, so alignment is validated, not trusted.

**Expected change surface**
The Binance adapter, an HTTP client wrapper, timeframe mapping, paging logic, error
translation, and adapter tests using recorded response fixtures.

**Acceptance criteria**
1. The adapter passes the `MKT-01` contract suite with no change to the suite.
2. A range needing more than 1000 candles returns a complete ascending series with
   no duplicates and no gaps at page joins.
3. A range with no data returns an empty series, not an error.
4. A provider error is translated into a typed provider error carrying enough
   context to diagnose it.
5. Rate-limit responses trigger backoff rather than immediate failure.
6. Tests run against recorded fixtures and need no live network access.

**Validation**
Run the contract suite and the adapter tests offline against fixtures. Run one
manual live fetch of a multi-page range and confirm continuity.

**Out of scope**
The live WebSocket stream, persistence, gap recovery, any second exchange.

**Proof relevance**
Contributes to `PROOF-PROVIDER-001`.

---

## MKT-03 - Candle persistence and query port

**Outcome**
Closed candles are stored in the market schema with an idempotent upsert keyed by
candle identity, and a query port returns an ordered range for a symbol, timeframe,
and time window.

**Why this slice exists**
Charts, gap recovery, and backtests all read from durable candle storage rather
than from the provider. This is the store they read.

**Dependencies**
`MKT-02`, `SETUP-04`.

**Authoritative references**
- [Baseline - Data ownership](../docs/architecture/architecture-baseline.md#data-ownership): Market Data owns candles, provider health, and dataset manifests.
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): only the owning module writes its data.
- [ADR-008](../docs/adr/ADR-008-realtime-delivery-recovery.md): PostgreSQL candle state is the recovery truth.

**Architecture constraints**
- Only Market Data writes market tables.
- The primary key is candle identity: provider, symbol, timeframe, open time.
- Writing the same candle twice is a no-op or a defined revision update, never a
  duplicate row.
- The repository stays in `market/infrastructure` and is never exported from
  `index.ts`.
- Only closed candles are stored as candles. An in-progress candle is not durable
  state.

**Expected change surface**
A migration creating the candle table with its unique identity constraint and range
index, a candle repository, a `MarketDataQuery` application port, and the scaffold
row from `WS-01` removed.

**Acceptance criteria**
1. Inserting the same candle twice leaves one row.
2. A range query returns candles in ascending open-time order, bounded inclusively
   at both ends as documented.
3. Querying a range with a gap returns what exists and does not fabricate candles.
4. A revision of an already stored candle updates it in place and records that a
   revision happened.
5. The boundary test confirms no module outside Market Data imports the repository.
6. The scaffold table from `WS-01` no longer exists.

**Validation**
Repository integration tests against a real database covering insert, duplicate
insert, revision, ordered range, and gap behaviour.

**Out of scope**
Backfill orchestration, gap detection, dataset manifests, HTTP exposure.

**Proof relevance**
Contributes to `PROOF-RT-001` and `PROOF-REP-001`.

---

## MKT-04 - Candle history endpoint

**Outcome**
An HTTP endpoint returns normalized candles for a symbol, timeframe, and range in a
transport DTO that contains no Binance-specific field.

**Why this slice exists**
The chart needs a snapshot before it can show anything, and this endpoint is also
the snapshot half of the snapshot-then-live realtime protocol.

**Dependencies**
`MKT-03`.

**Authoritative references**
- [Baseline - Logical modules, ARC-API](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): transport, DTO validation, and query composition only.
- Official project source section 6: the frontend must not depend on the Binance data shape.

**Architecture constraints**
- The controller calls the Market Data query port. It never touches the repository.
- The DTO names fields in project terms. It never exposes the provider's positional
  array or its abbreviations.
- Validation rejects an unknown timeframe, an inverted range, or an excessive
  requested count with a clear error.

**Expected change surface**
A controller and DTO in `ApiModule`, the candle response type in
`packages/api-contracts`, and an API client method in `apps/web`.

**Acceptance criteria**
1. A valid request returns ascending candles matching what the query port returns.
2. An unknown symbol or timeframe returns a client error with a clear message.
3. An inverted or oversized range is rejected.
4. The response type is shared with the SPA through the contract package.
5. No Binance field name appears anywhere in the response.

**Validation**
Endpoint integration tests for the valid and invalid cases. Confirm the SPA
compiles against the shared response type.

**Out of scope**
Realtime, chart rendering, dataset identity, pagination beyond a simple limit.

**Proof relevance**
Contributes to `PROOF-PROVIDER-001`: the same response must serve any provider.

---

## MKT-05 - Single candlestick chart

**Outcome**
The Realtime page renders one candlestick chart with a volume series for BTCUSDT at
a chosen timeframe, using data from `MKT-04`.

**Why this slice exists**
It closes the first user-visible vertical slice: Binance to normalized candle to
database to endpoint to chart. Everything after this is an extension of a working
picture rather than a leap of faith.

**Dependencies**
`MKT-04`, `SETUP-06`.

**Authoritative references**
- Official project source sections 5 and 25: candlestick and volume, and the
  visualization list.
- Sample interface images under `docs/requirements/sample-ui` - authoritative for
  visible layout and labels only.
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants): the frontend holds no business logic.

**Architecture constraints**
- The chart component receives already normalized candles. It performs no indicator
  or strategy calculation.
- The SPA never calls Binance directly.
- Loading, empty, and error states are explicit, not blank.

**Expected change surface**
A chart component in `apps/web`, a timeframe selector, the Realtime page body, and
data fetching through the existing API client.

**Acceptance criteria**
1. The chart renders candles and volume for a selected timeframe.
2. Changing the timeframe reloads only this chart's data.
3. Loading, empty, and error states each render something meaningful.
4. No arithmetic beyond display formatting exists in the chart component.
5. The production build still succeeds.

**Validation**
Component tests for the three states. A manual run showing a real BTCUSDT chart.

**Out of scope**
Live updates, four charts, indicator overlays, trade markers.

**Proof relevance**
Routine.

---

## MKT-06 - Binance live ingest process

**Outcome**
The market ingest process holds a Binance kline WebSocket connection, answers
server pings, normalizes incoming klines, persists a candle when the stream reports
it closed, and publishes a best-effort live notification after the commit.

**Why this slice exists**
Realtime updates are an explicit MVP requirement, and the baseline gives ingest its
own process role so a long-lived provider connection cannot compete with
interactive traffic.

**Dependencies**
`MKT-03`, `WS-03`.

**Authoritative references**
- [Baseline - Deployment topology](../docs/architecture/architecture-baseline.md#deployment-topology): market ingest is its own process role.
- [ADR-008 - Decision](../docs/adr/ADR-008-realtime-delivery-recovery.md): market ingest owns the Binance WebSocket and REST lifecycle, normalization, closed-candle persistence, health, reconnect and backoff.
- The verified provider facts table at the top of this file.

**Architecture constraints**
- Ingest runs as its own process, not inside the API process.
- Only a kline with the closed flag set becomes a durable candle. An in-progress
  kline may be published live but is never stored as a closed candle.
- The live notification is published only after the closed candle is committed.
- Redis Pub/Sub is at-most-once. Losing a notification must not lose data.
- Server pings must be answered or the connection is dropped after a minute.

**Expected change surface**
The market ingest entry command, a Binance stream client with ping handling,
subscription management for the active symbol and timeframe set, normalization
reusing `MKT-01` rules, commit through the `MKT-03` repository, and publication
through the `WS-03` publisher.

**Acceptance criteria**
1. The ingest process starts independently and logs its active streams.
2. A closed kline results in exactly one committed candle.
3. An in-progress kline is not committed as a closed candle.
4. A live notification is published only after the commit, and carries symbol,
   timeframe, and the candle.
5. Server pings are answered; a test or log proves the connection stays open past
   the ping interval.
6. Stopping Redis stops live notifications but candle commits continue.
7. Restarting the process resumes cleanly with no duplicate candles.

**Validation**
Tests against a fake stream server covering closed, in-progress, duplicate, and
ping cases. A manual run of at least two closed candles on the shortest timeframe
with the database inspected before and after.

**Out of scope**
Gap detection and recovery, provider health reporting, the client subscription
protocol, the four-chart layout.

**Proof relevance**
Contributes to `PROOF-RT-001`.

---

## MKT-07 - Chart subscription protocol over the WebSocket gateway

**Outcome**
A chart in the SPA subscribes over the gateway with its own subscription
identifier, receives a durable snapshot, and then receives only the live candle
updates that match its symbol and timeframe.

**Why this slice exists**
It turns the `WS-03` skeleton into the real chart protocol, and it establishes the
per-subscription isolation that `MKT-08` and `PROOF-RT-001` depend on.

**Dependencies**
`MKT-06`, `MKT-05`.

**Authoritative references**
- [ADR-008 - Decision](../docs/adr/ADR-008-realtime-delivery-recovery.md): each chart has a client subscription identifier plus a symbol and timeframe key; the API returns a durable snapshot first and then forwards matching live updates.
- [Baseline - Logical modules, ARC-API](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): the gateway owns client subscription and session state, push filtering, and backpressure.
- Official project source section 4.

**Architecture constraints**
- Subscription state belongs to `ARC-API`. Market Data does not know about client
  sessions.
- Snapshot before live, always. The snapshot carries a watermark so the client can
  discard or apply overlapping live messages deterministically.
- A dropped live message causes a snapshot refresh, never a data error.
- Outbound buffers stay bounded, with an explicit slow-client behaviour.

**Expected change surface**
Subscribe and unsubscribe messages in the gateway, a subscription registry keyed by
symbol and timeframe, snapshot composition through the Market Data query port, and
SPA chart subscription handling with reconnect.

**Acceptance criteria**
1. Subscribe returns a snapshot with a watermark, then live updates begin.
2. A live update for a different symbol or timeframe is not delivered to this
   subscription.
3. Unsubscribe stops delivery and releases the registry entry.
4. Client reconnect fetches a fresh snapshot before resuming live updates.
5. An overlapping candle between snapshot and live is applied once, not twice.
6. A slow client hits the documented bound instead of growing without limit.

**Validation**
Gateway integration tests for subscribe, filtering, unsubscribe, reconnect, and
overlap. A manual run showing one chart updating live.

**Out of scope**
Four simultaneous charts, gap recovery, progress or leaderboard channels.

**Proof relevance**
Contributes to `PROOF-RT-001`.

---

## MKT-08 - Four independent charts with independent timeframe changes

**Outcome**
The Realtime page shows four charts in a grid, each with its own timeframe
selector. Changing one chart's timeframe resets only that chart's subscription and
data, with no page reload and no effect on the other three.

**Why this slice exists**
This is an explicit MVP requirement and one of the assignment's central
architecture questions. It is also step 2 of `PROOF-RT-001`.

**Dependencies**
`MKT-07`.

**Authoritative references**
- Official project source sections 2, 3, 5 and 37: up to four timeframes, each chart changes its own timeframe, no full reload.
- [Proof plan - PROOF-RT-001](../docs/validation/architecture-proof-plan.md): four subscriptions with distinct identifiers and timeframes; changing one resets only that subscription.

**Architecture constraints**
- Each chart owns a distinct subscription identifier.
- A timeframe change is an unsubscribe plus a subscribe for that identifier only.
- No full page reload at any point.
- Backend subscription handling stays generic. The number four is a user interface
  layout choice, not a backend constant.

**Expected change surface**
A four-chart grid layout, per-chart subscription state in the SPA, and a
subscription lifecycle hook shared by the charts.

**Acceptance criteria**
1. Four charts render with four different timeframes at once.
2. Changing chart 1 from `5m` to `1h` changes only chart 1; the other three keep
   their data and their live updates.
3. No full page reload occurs during a timeframe change.
4. Server-side subscription state shows exactly four active entries, and still four
   after a timeframe change.
5. Closing the page releases all four subscriptions.

**Validation**
A test asserting per-subscription isolation on a timeframe change. A manual run
with the four timeframes from the assignment example, checking the server-side
subscription count before and after a change.

**Out of scope**
More than four charts, multiple pairs, saved layouts, indicator overlays.

**Proof relevance**
Directly claims part of `PROOF-RT-001` (four subscriptions, isolated timeframe
change, no full reload).

---

## MKT-09 - Gap detection, REST recovery, and provider health

**Outcome**
After a provider disconnect, ingest reconnects with backoff, computes which closed
intervals were missed, fetches them over REST, upserts them by candle identity, and
resumes live flow. Provider health is queryable and reflects degraded periods.

**Why this slice exists**
The assignment asks directly what happens when the Binance WebSocket disconnects
and whether candles are lost. Binance also disconnects every connection at the
24-hour mark, so this path runs in normal operation, not only in failure.

**Dependencies**
`MKT-06`, `MKT-02`.

**Authoritative references**
- [ADR-008 - Decision](../docs/adr/ADR-008-realtime-delivery-recovery.md): ingest owns reconnect and backoff, gap calculation, REST recovery, and deduplication.
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants) item 7: closed-candle gaps and duplicates are reconciled by Market Data, not the user interface.
- [Proof plan - PROOF-RT-001](../docs/validation/architecture-proof-plan.md) steps 3 and 4.
- The verified provider facts table at the top of this file: the 24-hour limit and the 300-connections-per-5-minutes limit.

**Architecture constraints**
- Gap repair belongs to Market Data. The user interface never patches gaps.
- Recovery reuses the same normalization and the same identity-keyed upsert, so
  recovered candles are indistinguishable from live ones.
- Reconnect uses backoff. A tight retry loop would breach the connection rate
  limit.
- Provider health is Market Data's own state, exposed through a query port.

**Expected change surface**
Reconnect and backoff logic, a missing-interval calculator, a REST recovery routine
using the `MKT-02` adapter, a provider health record and its query port, and a
health indicator in the SPA shell.

**Acceptance criteria**
1. A forced disconnect is detected and marks provider health degraded.
2. Reconnect uses increasing backoff with a documented ceiling.
3. Missing closed intervals during the outage are calculated correctly, including
   the boundary candles at each end of the gap.
4. Missing candles are fetched and stored, and re-running recovery creates no
   duplicates.
5. After recovery, provider health returns to healthy and live flow resumes.
6. A query confirms no unresolved known gap remains for the affected range.
7. The SPA shows a degraded indicator during the outage and clears it after.

**Validation**
Automated tests using a controllable fake stream server: disconnect, gap, recover,
reconnect, duplicate-recovery. A manual run against Binance with the connection
interrupted for a controlled interval, then a gap query over the affected range.

**Out of scope**
Multi-provider reconciliation, historical repair of ranges never subscribed,
alerting.

**Proof relevance**
Directly claims part of `PROOF-RT-001` (disconnect, missing-interval calculation,
REST recovery, deduplication, resume).

---

## MKT-10 - Dataset identity and manifest

**Outcome**
A `DatasetRef` can be created for a provider, symbol, timeframe, and time range.
It is immutable, carries a manifest with a watermark and an integrity reference,
and can be resolved later into exactly the same candle series.

**Why this slice exists**
Reproducibility rule 4 requires a completed result to resolve dataset identity,
manifest, provider, symbol, range, timeframe, and watermark. Backtests must run
against a dataset reference, not against "whatever is in the table today".

**Dependencies**
`MKT-03`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `DatasetRef` is an immutable dataset, version, manifest, provider, symbols, timeframe, range, watermark or snapshot, and integrity reference.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) item 4.
- [ADR-006](../docs/adr/ADR-006-immutable-experiment-provenance.md): a dataset reference uses an immutable manifest, snapshot, and watermark.
- [ADR-008](../docs/adr/ADR-008-realtime-delivery-recovery.md): ephemeral partial updates are not an experiment dataset unless captured into a versioned durable dataset.

**Architecture constraints**
- A dataset reference is append-only. It is never edited after creation.
- Resolving the same reference twice returns the same candles, or fails loudly if
  it cannot.
- The integrity reference is computed by canonical serialization so it is stable
  across processes and machines.
- Market Data owns dataset manifests. No other module writes them.

**Expected change surface**
A dataset table migration, dataset creation and resolution in `market/application`,
a canonical hashing helper in `platform`, and a dataset query port exported from
`MarketModule`.

**Acceptance criteria**
1. Creating a dataset for a range records provider, symbol, timeframe, range,
   watermark, candle count, and an integrity hash.
2. Resolving the reference returns exactly the recorded candles.
3. Creating the same dataset definition twice yields the same integrity hash.
4. If underlying candles were revised after creation, resolution fails or reports a
   mismatch instead of silently returning different data.
5. A dataset row cannot be updated; an attempt is rejected.
6. A gap inside the requested range is recorded explicitly as an accepted data
   quality exception rather than hidden.

**Validation**
Integration tests for creation, resolution, stable hashing, revision mismatch, and
immutability.

**Out of scope**
Dataset garbage collection, retention, export to files, multi-symbol datasets.

**Proof relevance**
Directly required by `PROOF-REP-001` item 4.
