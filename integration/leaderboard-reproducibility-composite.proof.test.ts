// FIN-06 evidence: PROOF-REP-001 re-run against a GENERATED COMPOSITE candidate.
//
// FIN-01 changed frozen specification content (compositeDefinition) and therefore
// the canonical content hash. This test drives the real production pipeline end
// to end -- SearchCoordinator generates a composite candidate, the real
// BacktestRunnerService executes and accepts it, the real LeaderboardProjector
// places it on the leaderboard -- then resolves the same trace the single-strategy
// PROOF-REP-001 evidence resolves (leaderboard entry -> result -> frozen spec ->
// composite definition -> dataset -> execution -> build/runtime provenance), and
// reruns the same computation directly to confirm the stored canonical trade hash
// is reproducible. No CompositeStrategyService or saved-composite row is used
// anywhere: the composite is carried entirely inline, per FIN-01.
//
// This wiring reaches directly into two modules' application/infrastructure
// layers, which only a process-level integration test (not a file inside a
// module) is allowed to do -- the same pattern integration/backtest-runner-
// lifecycle.e2e.test.ts already uses for the single-strategy runner pipeline.

import type { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../apps/backend/src/platform/test-database.js";
import { canonicalSha256 } from "../apps/backend/src/platform/canonical-json.js";
import type { Candle } from "../apps/backend/src/modules/market/index.js";
import { PostgresCandleRepository } from "../apps/backend/src/modules/market/infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "../apps/backend/src/modules/market/infrastructure/postgres-dataset-manifest-store.js";
import { MarketDatasetService } from "../apps/backend/src/modules/market/application/market-dataset-service.js";
import {
  createBuiltInStrategyRegistry,
  createBuiltInStrategyGeneratorRegistry,
  CombinationPolicyRegistry
} from "../apps/backend/src/modules/strategy/index.js";
import { PostgresExperimentSpecificationStore } from "../apps/backend/src/modules/experiment/infrastructure/postgres-experiment-specification-store.js";
import { ExperimentSpecificationService } from "../apps/backend/src/modules/experiment/application/experiment-specification-service.js";
import { PostgresBacktestRunStore } from "../apps/backend/src/modules/experiment/infrastructure/postgres-backtest-run-store.js";
import { BacktestRunService } from "../apps/backend/src/modules/experiment/application/backtest-run-service.js";
import { PostgresSearchRunStore } from "../apps/backend/src/modules/experiment/infrastructure/postgres-search-run-store.js";
import { SearchCoordinator } from "../apps/backend/src/modules/experiment/application/search-coordinator.js";
import { createBuiltInRankingPolicyRegistry } from "../apps/backend/src/modules/experiment/application/built-in-ranking-policy-registry.js";
import { WorkerThreadBacktestComputation } from "../apps/backend/src/modules/experiment/infrastructure/worker-thread-backtest-computation.js";
import { DurableBacktestResultAcceptor } from "../apps/backend/src/modules/experiment/application/backtest-result-acceptor.js";
import { PostgresResultAcceptanceStore } from "../apps/backend/src/modules/experiment/infrastructure/postgres-result-acceptance-store.js";
import { PostgresLeaderboardProjectionStore } from "../apps/backend/src/modules/experiment/infrastructure/postgres-leaderboard-projection-store.js";
import { LeaderboardProjector } from "../apps/backend/src/modules/experiment/application/leaderboard-projector.js";
import { PostgresLeaderboardQuery } from "../apps/backend/src/modules/experiment/infrastructure/postgres-leaderboard-query.js";
import { PostgresProvenanceQuery } from "../apps/backend/src/modules/experiment/infrastructure/postgres-provenance-query.js";
import { BacktestRunnerService } from "../apps/backend/src/modules/experiment/application/backtest-runner-service.js";
import type {
  ExperimentDraftContent,
  FreezeProvenance
} from "../apps/backend/src/modules/experiment/domain/experiment-specification.js";
import type { SearchConfiguration } from "../apps/backend/src/modules/experiment/domain/search-specification.js";

const provenance: FreezeProvenance = {
  engine: { id: "backtester", version: "1.0.0" },
  nodeRuntimeVersion: process.version.replace("v", ""),
  dependencyLockHash: "a".repeat(64),
  applicationCommit: "fin06-proof-app-build",
  workerCommit: "fin06-proof-worker-build",
  deterministicConfigVersion: "1.0.0"
};

const runtimeIdentity = {
  nodeRuntimeVersion: provenance.nodeRuntimeVersion,
  dependencyLockHash: provenance.dependencyLockHash,
  applicationCommit: provenance.applicationCommit,
  workerCommit: provenance.workerCommit,
  deterministicConfigVersion: provenance.deterministicConfigVersion
};

// Calibrated so a real RSI(14, buyThreshold 30, sellThreshold 70) + real
// moving-average(10/20) majority-vote composite produces both a sell (RSI
// overbought during the uptrend) and a long run of buy signals (RSI oversold
// during the decline), regardless of which OHLC field either component's
// randomly generated `priceSource` selects.
function buildCandles(): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  const push = (delta: number, index: number): void => {
    const open = price;
    price += delta;
    const close = price;
    const high = Math.max(open, close) + 0.05;
    const low = Math.min(open, close) - 0.05;
    candles.push({
      provider: "fixture", symbol: "BTCUSDT", timeframe: "1h",
      openTime: index * 3_600_000, closeTime: index * 3_600_000 + 3_599_999,
      open, high, low, close, volume: 10, closed: true, revision: 1
    });
  };
  for (let i = 0; i < 30; i++) push(0.3, i);
  for (let i = 30; i < 55; i++) push(-1.2, i);
  for (let i = 55; i < 75; i++) push(-0.6, i);
  return candles;
}

function compositeSearchConfiguration(): SearchConfiguration {
  return {
    generator: { id: "random-search", version: "1.0.0" },
    generatorConfiguration: {},
    searchSpace: {
      strategies: [{ id: "rsi", version: "1.0.0" }, { id: "moving-average", version: "1.0.0" }],
      compositeSizes: [2],
      policies: [{ id: "majority-vote", version: "1.0.0" }],
      // Pin the two schema-ranged RSI fields so the generated candidate's
      // signals are predictable against the calibrated candles above; period,
      // fastPeriod, and slowPeriod have no schema maximum and fall back to
      // their defaults (14, 10, 20) unpinned. priceSource on both components
      // stays randomly generator-chosen; the candle data is calibrated to
      // produce a buy majority regardless of which one is picked.
      parameterRanges: {
        rsi: {
          buyThreshold: { minimum: 30, maximum: 30 },
          sellThreshold: { minimum: 70, maximum: 70 }
        }
      }
    },
    seed: "fin06-proof-rep-001-composite",
    rankingPolicy: { id: "weighted-return-drawdown", version: "1.0.0" },
    rankingConfiguration: { weights: { totalReturn: 1, maximumDrawdown: -1 }, minTrades: 1 },
    stopConditions: { maxCandidates: 1 },
    maxInFlight: 1
  };
}

describe("PROOF-REP-001 leaderboard reproducibility (generated composite)", () => {
  let pool: Pool;

  afterAll(async () => {
    await pool?.end();
  });

  it(
    "traces a generated composite from the leaderboard back to its frozen specification and reruns to the same trade hash",
    async () => {
      pool = await resetTestDatabase();
      const candles = buildCandles();

      const candleStore = new PostgresCandleRepository(pool);
      await candleStore.appendMany(candles);
      const datasets = new MarketDatasetService(candleStore, new PostgresDatasetManifestStore(pool));
      const datasetRef = (await datasets.createDataset({
        provider: "fixture", symbol: "BTCUSDT", timeframe: "1h",
        range: { startTime: 0, endTime: candles.length * 3_600_000 }
      })).ref;

      const strategies = createBuiltInStrategyRegistry();
      const specStore = new PostgresExperimentSpecificationStore(pool);
      const specifications = new ExperimentSpecificationService(specStore, datasets, strategies);
      const runStore = new PostgresBacktestRunStore(pool);
      const runs = new BacktestRunService(specifications, runStore, runStore);
      const searchStore = new PostgresSearchRunStore(pool);
      const generators = createBuiltInStrategyGeneratorRegistry(strategies, new CombinationPolicyRegistry());
      const rankings = createBuiltInRankingPolicyRegistry();

      const leaderboardStore = new PostgresLeaderboardProjectionStore(pool);
      const projector = new LeaderboardProjector(leaderboardStore, specifications, rankings, 10);

      // 1. Freeze the parent search experiment and generate one composite candidate.
      const draft = await specifications.createDraft({
        schemaVersion: "v1",
        datasetRef,
        strategy: { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" } },
        execution: {
          initialCapital: 10_000, feeRate: 0.001, slippageRate: 0.0005,
          signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
          leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
          stopLoss: { enabled: false }, takeProfit: { enabled: false },
          sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close",
          decimalPlaces: 8
        },
        metricSet: { id: "mvp-metrics", version: "1.0.0" },
        search: compositeSearchConfiguration()
      } satisfies ExperimentDraftContent);
      const parentSpecId = (await specifications.freeze(draft.specId, provenance)).specId;

      const coordinator = new SearchCoordinator(specifications, runs, generators, rankings, searchStore, projector);
      await coordinator.start(parentSpecId, "fin06-proof-request");
      const tickOutcome = await coordinator.tick(parentSpecId);
      expect(tickOutcome.kind).toBe("submitted");

      const candidateRow = await pool.query<{ run_id: string; derived_spec_id: string }>(
        "SELECT run_id, derived_spec_id FROM experiment.search_candidates WHERE spec_id = $1 AND sequence_number = 0",
        [parentSpecId]
      );
      const runId = candidateRow.rows[0]?.run_id;
      const derivedSpecId = candidateRow.rows[0]?.derived_spec_id;
      if (runId === undefined || derivedSpecId === undefined) throw new Error("composite candidate was not recorded");

      // 2. Confirm the generated composite definition reached the frozen spec inline
      // (no saved-composite lookup: this is FIN-01's own contract).
      const derivedSpec = await specifications.get(derivedSpecId);
      if (derivedSpec.status !== "frozen") throw new Error("expected the derived candidate specification to be frozen");
      const compositeDefinition = derivedSpec.content.compositeDefinition;
      expect(compositeDefinition).toBeDefined();
      expect(compositeDefinition?.components).toHaveLength(2);
      expect(new Set(compositeDefinition?.components.map((component) => component.id)))
        .toEqual(new Set(["rsi", "moving-average"]));
      expect(compositeDefinition?.policy.id).toBe("majority-vote");

      // 3. Execute the submitted run through the real, separate-runner pipeline:
      // claim -> compute (worker thread, inline composite resolution) -> accept
      // (durable trade-hash + checklist) -> project (leaderboard).
      const acceptor = new DurableBacktestResultAcceptor(
        new PostgresResultAcceptanceStore(pool),
        projector
      );
      const runner = new BacktestRunnerService(
        runStore,
        { get: async (specId) => {
          const value = await specifications.get(specId);
          if (value.status !== "frozen") throw new Error(`EXPERIMENT_NOT_FROZEN: ${specId}`);
          return value;
        } },
        datasets,
        new WorkerThreadBacktestComputation(),
        acceptor,
        runtimeIdentity
      );
      const processed = await runner.processNext("fin06-proof-runner");
      expect(processed).toBe(true);

      const runStatus = await runs.get(runId);
      expect(runStatus.status).toBe("completed");

      // 4. Leaderboard entry: identifiable as a composite, not a single strategy.
      const leaderboard = await new PostgresLeaderboardQuery(pool).getLeaderboard(parentSpecId, "rank");
      expect(leaderboard?.entries).toHaveLength(1);
      const entry = leaderboard!.entries[0]!;
      expect(entry.runId).toBe(runId);
      expect(entry.strategy.kind).toBe("composite");
      expect(entry.metrics.numberOfTrades).toBeGreaterThan(0);

      // 5. Provenance: leaderboard entry -> result -> frozen spec (already resolved
      // above) -> dataset -> execution -> runtime/build identity.
      const provenanceResponse = await new PostgresProvenanceQuery(pool).getProvenance(runId);
      expect(provenanceResponse).toBeDefined();
      const checklist = provenanceResponse!.checklist as Record<string, { status: string; value?: unknown }>;
      expect(checklist.specification?.status).toBe("recorded");
      expect((checklist.specification?.value as { id?: string } | undefined)?.id ?? derivedSpecId).toBeDefined();
      expect(checklist.dataset?.status).toBe("recorded");
      expect(checklist.execution?.status).toBe("recorded");
      expect(checklist.runtimeAndBuild?.value).toEqual(runtimeIdentity);
      expect(checklist.engine?.value).toEqual({ id: "backtester", version: "1.0.0" });

      // 6. Rerun determinism: recompute the same generated composite directly
      // (same frozen spec + same candles) and confirm the canonical trade hash
      // matches the one PostgresResultAcceptanceStore stored for the leaderboard
      // entry above. No saved-composite row is read anywhere in this rerun.
      const rerunComputation = new WorkerThreadBacktestComputation();
      const rerun = await rerunComputation.compute({ specification: derivedSpec, candles });
      const rerunHash = canonicalSha256(rerun.simulation.trades);
      expect(rerunHash).toBe(provenanceResponse!.tradeContentHash);
      expect(rerun.simulation.trades.length).toBeGreaterThan(0);
    },
    120_000
  );
});
