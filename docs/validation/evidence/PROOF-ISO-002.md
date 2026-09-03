# PROOF-ISO-002 - Sentiment Failure Isolation Evidence

## Result

**PASS** on 2026-09-01. The guarded V5 test database recorded a missing-model
attempt durably, retained the item as retryable, and recovered it through the
normal source-built News worker. The required NEWS-05 direct context-assembly
seam then demonstrated current, stale/degraded, and missing/blocked policies
with durable result and model provenance. A technical-only descriptor made zero
News feature calls.

`NEWS-06` was not used. It remains optional and is not an ISO-002 prerequisite.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-4.2 -> QA-ISO-002 -> D-10 -> ADR-007.
- Proof definition: `docs/validation/architecture-proof-plan.md`,
  `PROOF-ISO-002`.
- Relevant decision: `ADR-007-news-sentiment-isolation.md`.
- Direct required seam: `NEWS-05` `SentimentFeature` through
  `ExperimentSentimentContextAssembler`.

## Code, build, and environment identity

- Base commit: `d02318bd160970136cb032d2ceb3fdb4e589d96a` on
  `v5-news-and-sentiment`.
- Version tag: none. The proof ran on the uncommitted V5 certification worktree;
  no commit, push, or tag was created.
- Pre-evidence worktree diff Git object:
  `80a83625b62927f20f204d32da67c35e2f7eb801`.
- `pnpm-lock.yaml` SHA-256:
  `2def83389247e1c769c6f1ca7c619abdc96286fef4201850d2fceeeae9ffa305`.
- `docker-compose.yml` SHA-256:
  `dadf691f047aa5f59cd73194d772c855cd2e78739607f05394178743226f1535`.
- Proof-plan SHA-256:
  `4eb36d4608948bf28552f637934d81179131c3422a733a707a60316538998610`.
- Docker Desktop Engine 29.6.1, Linux containers; backend image
  `b96c130810c1` was built from the current source worktree.

## Guarded test-database baseline

Before the run, `csl_test_v5_certification` was checked read-only. Its durable
marker named that exact database and carried the expected explicit guard token;
it had all 18 source migrations, zero other client sessions, and zero advisory
locks. The protected Compose database was not reset, reseeded, dropped, or
changed outside normal application operations.

## Model outage, durable retry, and recovery

The pre-existing pending fixture
`coindesk-rss|https://www.coindesk.com/fixture/second` was processed by an
ephemeral source-built News worker with `OPENAI_API_KEY` intentionally empty:

```powershell
docker compose run --rm --no-deps -e POSTGRES_DB=csl_test_v5_certification `
  -e OPENAI_API_KEY= news-worker pnpm --filter @crypto-strategy-lab/backend `
  exec tsx src/main.news-worker.ts --analyze-once
```

At `2026-09-01T11:17:26.947Z` it opened attempt 1 and, at
`2026-09-01T11:17:26.976Z`, stored outcome `failed` with reason
`ANALYZER_UNAVAILABLE: OpenAI credential is missing`. The item returned to
`pending`; the worker logged one retryable failure and exited normally.

While no analyzer was available, a deterministic BTC-scoped proof fixture was
persisted through the real `NewsCollectionService` and
`PostgresNewsCollectionRepository` only, not direct SQL. Its collector result
was `healthy`, with one fetched and one stored item:

`proof-iso-002|https://example.com/proof-iso-002/btc-sentiment`.

Recovery ran the same source-built worker with the current Compose credential
configuration. At `2026-09-01T11:20:56.842Z` it claimed both pending rows and
at `2026-09-01T11:21:02.105Z` reported two analyzed, zero retryable, zero
degraded, and zero lost claims. The original item therefore has a durable failed
attempt 1 and successful attempt 2; the BTC proof item has successful attempt 1.
Both successful results record:

- `model_id=openai-responses`
- `model_artifact_id=openai://responses/gpt-4.1-mini-2025-04-14`
- `model_version=gpt-4.1-mini-2025-04-14`
- `input_version=news-item.v1`
- `preprocessing_version=news-sentiment-input-v1`

The temporary worker containers exited and the post-run query again found zero
other test-database sessions and zero advisory locks.

## NEWS-05 direct context assembly

The proof invoked `ExperimentSentimentContextAssembler` directly with the real
`PostgresSentimentFeatureStore` and `SentimentFeatureService`, not NEWS-06. The
BTC fixture was evaluated in a one-hour window using `maxAgeMs=600000`,
`onMissing=block`, and `onStale=degrade`.

- At `1788048960000`, the assembly was `ready`; the input point was score `0`,
  freshness was `current` at `60000` ms, and the usage manifest recorded the
  BTC fixture result ID and model version
  `gpt-4.1-mini-2025-04-14`.
- At `1788049500001`, the assembly stayed usable but the same observed result
  was `stale` at `600001` ms with quality `degraded` and policy
  `applied/stale/degrade`.
- `ETHUSDT` had no matching stored result. Assembly returned `blocked`, an empty
  input list, `aggregateSentiment=null`, and policy
  `applied/missing/block`; its usage manifest contained no result IDs or model
  versions.
- A technical-only descriptor returned `technical-only` and did not resolve the
  News feature: the resolver call counter was `3` before and `3` after that
  assembly.

The live source Compose topology remained running throughout. Together with the
technical-only Compose backtest recorded in `PROOF-ISO-001`, this shows that
non-sentiment work has no News inference call path.

## Conclusion

Inference unavailability is durable and retryable rather than a worker crash;
recovery produces durable model provenance. NEWS-05 applies the declared
missing/stale policy directly, and technical-only work does not call News.
`PROOF-ISO-002` passes.
