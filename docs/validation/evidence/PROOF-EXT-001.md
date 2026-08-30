# PROOF-EXT-001 - Strategy Extensibility Evidence

## Result

**PASS** on 2026-08-29. `MACDStrategy` was added through the existing pure
`Strategy` contract, descriptor, and built-in registry. The registered strategy
runs through the existing backtest and result-acceptance path. The accepted result
provenance carries the exact MACD ID, version, and parameters from the frozen
specification.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-1.1 -> QA-MOD-001 -> D-02 -> ADR-002 -> ARC-STRATEGY.
- Decision: `docs/adr/ADR-002-strategy-and-search-contracts.md`.
- Proof definition: `docs/validation/architecture-proof-plan.md`,
  `PROOF-EXT-001`.

## Code and dependency identity

- HEAD: `2b981391f8f66258a11b33597ee1cb5eb17f3ba0`
  (`feat(v3): DEMO-01 Compose full-system topology and V3 integration gate`).
- The proof ran in the existing uncommitted recovery worktree. No reset, stash,
  commit, or tag was created.
- Node.js: v22.19.0.
- pnpm: 9.15.9.
- pnpm lock SHA-256:
  `e37cb2406761a8c2e119990792f2c7f48f381c5188bff777cba8ac7a6fb29c54`.
- Built-in registry SHA-256:
  `60b3d76c41bbec239a5c30aadec2d9af3c3340167093074d1bb600a0959fdc07`.
- MACD implementation SHA-256:
  `85db8736419fb25c10461e324971002185fafe9ac616333bfa9877efd5d0c213`.
- MACD domain test SHA-256:
  `46989adc3af17d76f168efb2e9b09800dbda85aa8c964ecd22544e962ac5118e`.
- Representative backtest proof test SHA-256:
  `fb9decbe568f5adb57520e6bbba86328278a8963ed702857c2f2e09af53b06b8`.

## Environment and fixture

- Timestamp: 2026-08-29T03:16:54+07:00.
- OS: Microsoft Windows NT 10.0.26200.0.
- CPU: 13th Gen Intel(R) Core(TM) i7-1355U.
- Memory: 16,857,645,056 bytes.
- Fixture: six normalized, closed `BTCUSDT` one-hour candles from
  `proof-provider`, revision 1, with close values `[1, 1, 1, 1, 2, 2]`.
- MACD parameters: `fastPeriod=2`, `slowPeriod=3`, `signalPeriod=2`,
  `priceSource=close`.
- Execution: V1 next-open model, 1,000 initial capital, no fees or slippage.

## Behavior evidence

The descriptor exposes `macd@1.0.0` as a built-in momentum strategy with a
complete parameter schema and a required `price-bars` input. The implementation
uses the existing normalized analysis context and emits only generic line
annotations and normalized buy, sell, or hold signals.

The representative proof resolves MACD from `createBuiltInStrategyRegistry`,
executes it through the unchanged `computeBacktest` application seam, and sends
the resulting simulation and metrics through `DurableBacktestResultAcceptor`.
The fixture creates one completed trade and one `numberOfTrades` metric value.
The result-acceptance store receives this exact strategy provenance:

```json
{
  "id": "macd",
  "version": "1.0.0",
  "parameters": {
    "fastPeriod": 2,
    "slowPeriod": 3,
    "signalPeriod": 2,
    "priceSource": "close"
  }
}
```

## Commands and results

Initial TDD check:

```powershell
pnpm exec vitest run apps/backend/src/modules/strategy/domain/macd-strategy.test.ts
```

- RED: 1/1 failed because `macd` was absent from the built-in registry.
- GREEN after the minimum implementation: 1/1 passed.

Final focused validation:

```powershell
pnpm exec vitest run `
  apps/backend/src/modules/strategy/domain/macd-strategy.test.ts `
  apps/backend/src/modules/strategy/application/strategy-registry.test.ts `
  apps/backend/src/modules/experiment/application/macd-strategy-extensibility.proof.test.ts
```

- PASS: 3 files, 15 tests.
- The domain tests cover metadata, defaults, buy/sell/hold behavior, generic
  annotation alignment, and relational parameter validation.
- The existing registry contract suite remains green.
- The representative backtest and result-provenance check passes.

```powershell
pnpm --filter @crypto-strategy-lab/backend typecheck
```

- PASS: backend TypeScript compilation completed with no errors.

## Diff inspection

The proof-local implementation delta is limited to:

```text
 M apps/backend/src/modules/strategy/application/built-in-strategy-registry.ts
?? apps/backend/src/modules/strategy/domain/macd-strategy.ts
?? apps/backend/src/modules/strategy/domain/macd-strategy.test.ts
?? apps/backend/src/modules/experiment/application/macd-strategy-extensibility.proof.test.ts
?? docs/validation/evidence/PROOF-EXT-001.md
```

The built-in registry changed by one import and one registration entry. There is
no strategy-type switch.

This command returned no paths:

```powershell
git diff --name-only HEAD -- `
  apps/backend/src/modules/experiment/domain/backtester.ts `
  apps/backend/src/modules/experiment/domain/evaluator.ts `
  apps/backend/src/modules/experiment/domain/ranking-policy.ts `
  apps/backend/src/modules/experiment/domain/weighted-return-drawdown-policy.ts `
  apps/backend/src/modules/market/infrastructure
```

Therefore the Backtester, Evaluator, RankingPolicy implementations, and provider
adapters are unchanged from HEAD. This proof also made no change to persistence
ownership, schemas, repositories, or frontend files.

The recovery worktree was already dirty before this proof and contained unrelated
frontend, experiment, strategy-composition, migration, and governance recovery
work. Those pre-existing changes are not attributed to this proof. The proof
result is based on the observed proof-local path set above and the focused tests,
not on a claim that the whole repository matched HEAD.

## Deviations and follow-up

- No architecture deviation was required.
- No full suite, lint run, Docker Compose run, or database integration run was
  performed for this focused proof. Consolidated certification owns those checks.
- No follow-up architecture change is required.
