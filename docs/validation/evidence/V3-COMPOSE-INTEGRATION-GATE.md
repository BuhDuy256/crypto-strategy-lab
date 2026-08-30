# V3 Compose integration gate - evidence

Records the Docker Compose integration gate for V3 (`DEMO-01`). This is the
gate defined in
[`implementation-plan/VERSIONS.md`](../../../implementation-plan/VERSIONS.md#compose-integration-gate-every-version):
the version's required process topology must come up from a clean checkout
through the documented Compose path, and the version's demo scenario must be
walked on that assembled topology. It complements, and does not replace, the
host-path Definition of Demoable (see `V3-DEFINITION-OF-DEMOABLE.md`, already
PASS), the architecture proofs, and the test suite.

**Result: PASS.** Walked on 2026-08-26.

## What was built

Before this work `docker-compose.yml` started PostgreSQL only. `DEMO-01` now
assembles the full V1 topology (unchanged through V2 and V3):

- `Dockerfile` - one backend image (serves the migrate, api, and runner roles
  through per-service commands) and one Nginx web image (built SPA + `/api`
  reverse proxy).
- `.dockerignore` - keeps the build context clean and never copies a local
  `.env` or host `node_modules` into an image.
- `apps/web/nginx.conf` - serves the SPA and proxies `/api` to the api process.
- `docker-compose.yml` - services `postgres`, `migrate`, `api`, `runner`, `web`
  with health/ordering dependencies and container-appropriate env wiring.

The topology contains **no later-version service** (no Redis, BullMQ, outbox, or
news). `docker compose config --services` lists exactly:
`api migrate postgres runner web`.

## The one documented command

```powershell
docker compose up --build
```

Brings up the topology in dependency order from a clean checkout: PostgreSQL
becomes healthy -> `migrate` applies the schema and exits 0 -> `api` starts and
passes its health check -> `runner` starts -> `web` starts. Migrations run
automatically as the `migrate` service; there is no manual migration step.
Candle history is loaded with the documented backfill command
(`docker compose exec api pnpm run market:backfill -- ...`), which fetched 1000
real Binance 1h BTCUSDT candles into append-only storage.

Environment wiring: the backend services reach PostgreSQL by service name, so
Compose sets `POSTGRES_HOST=postgres` and internal `POSTGRES_PORT=5432` for
them, independent of the host values in `.env`. The api and runner receive the
same `DEPENDENCY_LOCK_HASH` / `APPLICATION_COMMIT` / `WORKER_COMMIT` from `.env`,
which is required for a candidate result to pass acceptance.

## Two defects found by actually walking the gate, and fixed

Both were exposed only by assembling the topology; host tests do not catch them.
Both fixes are infrastructure, not domain code - no `.ts` source changed.

1. **Worker thread could not load TypeScript on Node 20.** The backtest runner
   spawns its CPU work in a Worker Thread that runs TypeScript through the tsx
   ESM loader. Node 20 does not apply an `--import`-registered loader to a
   worker's own entry module, so every backtest failed with
   `Unknown file extension ".ts"` (all candidates `failed`, none `completed`).
   Node 22 applies it correctly, and Node 22 is the host runtime this code is
   already proven on. Fix: base image `node:22-alpine` (allowed by
   `package.json` engines `>=20.12`). Verified: after the change a search run
   reported `completed` candidates with `failed: 0`.

2. **Nginx returned 502 after an API restart.** Nginx resolves an upstream host
   name once at startup and caches the address. The demo restarts the api
   container on purpose ("restart the API mid-run"), which gives it a new IP, so
   the proxy pinned a dead address and returned 502. Fix: resolve the api host
   through Docker's embedded DNS (`127.0.0.11`) with a short TTL via a variable
   upstream in `apps/web/nginx.conf`. Verified: `GET /api/health` through the SPA
   proxy succeeds before and after `docker compose restart api`.

## V3 demo scenario, walked on the Compose topology

Driven through the SPA's own `/api` proxy (the endpoints the Discovery page
calls). Scenario source: `VERSIONS.md` V3.

1. **Configure + generator selectable.** `POST /experiments/search` created a run
   (dataset BTCUSDT 1h, `random-search` generator, single-strategy space,
   candidate-limit stop, seed). The generator catalog served both
   `random-search` and `grid-search`.
2. **Start; counter rises; leaderboard fills.** `POST .../search/start` -> the
   progress snapshot showed `generated`/`submitted`/`completed` rising with
   `failed: 0`; the leaderboard returned 9 ranked entries with strategy
   composition and the four MVP metrics.
3. **Pause and resume converge.** pause -> converged `paused`; resume ->
   `running` (converged states, not optimistic).
4. **API restart survives.** `docker compose restart api` -> `/api/health` OK
   through the proxy and the run progress read back unchanged; the runner
   (separate process) was unaffected.
5. **Stop condition fires with a reason.** A `maxCandidates: 2` run stopped with
   `stopReason: "max-candidates"`.
6. **Top entry detail.** For the top run: paged trades (entry/exit, fees,
   slippage, direction, P&L), chart overlay annotations (Bollinger band), and the
   four metrics all resolved.
7. **Provenance checklist.** The provenance record resolved the engine + version,
   the runner attempt, the immutable dataset snapshot (`datasetId` +
   `integrityHash`), and the trade content hash - every leaderboard row resolves
   to its result and frozen spec.
8. **Reproducibility, walked on the topology.** A second search with the same
   seed and search space was run on the assembled topology. Its top leaderboard
   entry resolved to the identical candidate `contentHash`
   (`24943d8e...`) and the identical stored `tradeContentHash`
   (`d116676e...`) as the first run's top entry - the same recorded result. This
   also exercised the projection delete-and-rebuild path on Compose: the second
   run's candidates were content-identical to already-accepted results, so the
   live projection did not re-emit them; the documented `leaderboard:rebuild` CLI
   (`docker compose exec api pnpm run leaderboard:rebuild -- --experiment <id>`)
   reconstructed the board to the same content and top entry. Full determinism is
   additionally proven by `PROOF-REP-001` (host).
9. **Architecture point.** `cancel` on a running search converged
   `cancelling` -> `cancelled` with completed results intact; the second
   generator in the catalog shows the generator is replaceable with no downstream
   change.

## Final topology state

```
service    status
postgres   Up (healthy)
migrate    Exited (0)
api        Up (healthy)   :3000
runner     Up
web        Up             :8080
node in image: v22.23.2
later-version containers (redis/bullmq/news): NONE
```

## Scope notes

- Control transition durability across a restart and the three stop conditions
  are proven exhaustively by `PROOF-CONTROL-001` (host); this gate confirms the
  same behavior on the assembled Compose topology.
- Composite (multi-strategy) search is not part of the V3 demo scenario and is
  rejected by the search path (`SEARCH_COMPOSITE_UNSUPPORTED`); the demo uses the
  single-strategy random search, as the scenario specifies.
- Follow-up flagged (out of `DEMO-01` scope): `package.json` still declares
  `engines.node >=20.12.0`, but the backtest runner's tsx worker thread now
  requires Node 22 on the host path too. The floor and the real requirement
  disagree; raising it is a separate small config change.
- This gate does not tag `v3.0-demo` and does not advance the validation status;
  both remain the owner's decisions.
