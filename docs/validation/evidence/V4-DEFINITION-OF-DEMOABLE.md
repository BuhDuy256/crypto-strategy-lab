# V4 - Realtime Market Data - Definition of Demoable Evidence

## Result

**PASS** on 2026-08-30, on the final V4 Docker Compose topology. Every V4
Definition-of-Demoable condition in `implementation-plan/VERSIONS.md` has current
evidence. This record is separate from, and links to, the architecture proof record
for `PROOF-RT-001`.

## Release identity

- Base implementation commit:
  `4e00730fca83e68c0e82d042f4347417d7dddb0c`.
- Runtime application and worker identity:
  `4e00730fca83e68c0e82d042f4347417d7dddb0c`.
- pnpm lock SHA-256:
  `943d1bfe50e6ac3e432cfeb93a50c3c4836d4e186bb02ebdbcd6b956c5e8d7b2`.
- Release commit and local annotated tag `v4.0-demo` carry this record.

## Conditions

| Condition | Current evidence | Result |
|---|---|---|
| Four live subscriptions use distinct identifiers | Fresh browser observation showed chart-1 through chart-4 live at `5m`, `15m`, `1h`, and `4h`; `smoke:mkt11` confirmed four API subscriptions. | PASS |
| One timeframe change resets only that subscription with no page reload | `smoke:mkt11` retargeted chart 1, kept charts 2 to 4 live and unchanged, and retained its browser marker. | PASS |
| Controlled disconnect recovers with correct intervals, no unresolved gap, and no duplicate | Provider-only outage crossed 1m closes; health returned to healthy in 6,490 ms; the range query returned 3/3 and `resolved: true`; PostgreSQL had zero duplicate identities. | PASS |
| Redis stop leaves committed candles and fresh snapshots correct | With Redis stopped, durable 1m data advanced 9 to 10 candles; `smoke:ws03` observed fresh snapshots after API restart while Redis was stopped. | PASS |
| No in-progress candle is written as a closed candle | `smoke:mkt11` published forming ticks and asserted unchanged durable counts. | PASS |
| V1 to V3 still pass | Final full regression passed 94 test files and 544 tests, including V1/V2 E2E, V3 search, and architecture boundary tests. | PASS |
| Required architecture proof passes | [PROOF-RT-001](PROOF-RT-001.md) records four-chart isolation, recovery, immutable snapshots, Redis durability, and delivery latency baseline. | PASS |

## Compose and browser walkthrough

The topology was rebuilt from the V4 source with:

```powershell
docker compose up --build -d --force-recreate
docker compose exec -T api pnpm run demo:seed
```

PostgreSQL, Redis, API, runner, web, and market-ingest were up; migrate exited 0.
A fresh browser then observed all four charts connected/live with 150 durable candles
each and six live updates on every chart in 12 seconds. A separate browser page reload
returned all four snapshots with the same durable counts and latest candle identities.

The complete demo steps and commands are in [`docs/demo-script.md`](../../demo-script.md).
The detailed outage, gap, dataset snapshot, Redis, and latency evidence is in
[PROOF-RT-001.md](PROOF-RT-001.md).

## Scope note

V4 is frozen at `v4.0-demo`. This does not authorize V5, create a V5 branch, or
advance the product version beyond V4.
