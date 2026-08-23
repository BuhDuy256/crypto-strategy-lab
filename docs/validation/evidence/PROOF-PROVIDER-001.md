# PROOF-PROVIDER-001 - Provider Replaceability Evidence

## Result

**PASS** on 2026-08-23. A deterministic second provider passed the complete common
provider contract, its normalized candles were persisted and resolved as an immutable
dataset, and the unchanged production chart rendered those candles.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-1.3/P-3.5 -> QA-MOD-003 -> D-03 -> ADR-003.
- Proof definition: `docs/validation/architecture-proof-plan.md`,
  `PROOF-PROVIDER-001`.

## Code and dependency identity

- Base commit: `b823d45ea8beb45916a0dfe347fff7b9a1a32e7f`.
- Version tag: none; the Project Owner has not created `v1.0-demo`.
- The proof ran on the uncommitted implementation worktree. No commit or tag was
  created because Git actions require separate owner approval.
- pnpm lock SHA-256:
  `67da7ea343ccfe42a368e40a3ad0c07a7ceb281f885895690a38931a0d408916`.
- Provider proof test SHA-256:
  `0f8ce100d43ddca578634bd779bab28ee19429c7c884f5a88bc4d45db30a99fa`.
- Production chart SHA-256:
  `f04a2ef99e6b4c294740df001f83222dd5b7a638362666528eab12547bcdd30e`.
- Chart proof test SHA-256:
  `bbf1c1d981cbf6822a082eb7aa3b1da2dc3f8aa77292f494d2553ed10d0af192`.

## Environment and configuration

- OS: Microsoft Windows 11 Home.
- CPU: AMD Ryzen 9 6900HS with Radeon Graphics.
- Memory: 16,366,272,512 bytes.
- Node.js: v24.19.0.
- pnpm: 9.15.9.
- PostgreSQL: `postgres:16-alpine`, Docker Compose service healthy, host port 5433.
- Fixture: `proof-provider`, BTCUSDT, `1h`, two closed candles beginning at
  `2026-08-01T00:00:00.000Z`.

## Commands and automated evidence

Run at 2026-08-23T12:00:02Z:

```powershell
pnpm exec vitest run `
  apps/backend/src/modules/market/infrastructure/binance-market-data-provider.test.ts `
  apps/backend/src/modules/market/application/provider-replaceability.proof.test.ts `
  apps/web/src/components/CandlestickChart.test.tsx
```

The Binance adapter and the second provider run the same contract rules. The second
provider passes normalized history, stable health, unsupported-symbol, and
unsupported-timeframe cases. Its normalized candles then pass append-only storage,
dataset creation, and exact dataset resolution. The chart component test receives a
`proof-provider` candle and maps its candle and volume series without fetching.

## Browser evidence

A temporary Vite harness imported the unchanged `CandlestickChart`, supplied the same
two `proof-provider` candles, and was removed after the run. The browser reported:

- heading `PROOF-PROVIDER-001 · proof-provider`;
- accessible chart label `BTCUSDT candlestick chart`;
- seven chart canvases with nonzero dimensions, including two 1174 x 392 canvases;
- zero browser warnings and zero browser errors.

The proof-specific tracked change surface contains the Market-owned proof test, this
evidence record, and a provider-neutral fixture change in the existing chart test.
No production file under `apps/web/src` and no Strategy implementation changed for
this proof. The temporary browser harness is absent from the final tree.

## Deviations and follow-up

- No deviation was observed. The normalized `Candle`, provider port, dataset service,
  and chart prop remain provider-neutral.
- The V1 HTTP request vocabulary remains intentionally limited to Binance by the
  accepted MKT-04 decision. This proof validates the module and presentation seams;
  adding an OKX transport option later requires adapter and API catalog work, not a
  chart, dataset, or Strategy redesign.
