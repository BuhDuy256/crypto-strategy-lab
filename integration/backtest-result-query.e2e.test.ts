// HTTP and PostgreSQL proof for the accepted EXP-10 result-query contract.

import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiModule } from "../apps/backend/src/modules/api/index.js";
import { BacktestResultQuery, BacktestRunService } from "../apps/backend/src/modules/experiment/index.js";
import { PostgresBacktestResultQuery } from "../apps/backend/src/modules/experiment/infrastructure/postgres-backtest-result-query.js";
import { resetTestDatabase } from "../apps/backend/src/platform/test-database.js";

const ids = {
  completed: "20000000-0000-4000-8000-000000000001",
  queued: "20000000-0000-4000-8000-000000000002",
  failed: "20000000-0000-4000-8000-000000000003",
  zero: "20000000-0000-4000-8000-000000000004",
  missing: "20000000-0000-4000-8000-000000000099"
};

describe("backtest result query HTTP surface", () => {
  let pool: Pool;
  let application: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    for (const [index, runId] of Object.values(ids).filter((id) => id !== ids.missing).entries()) {
      const specId = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const status = runId === ids.failed ? "failed" : runId === ids.queued ? "queued" : "completed";
      await pool.query(
        `INSERT INTO experiment.specifications
         (spec_id, status, content, content_hash, frozen_at)
         VALUES ($1, 'frozen', '{}'::jsonb, $2, now())`, [specId, String(index + 1).repeat(64)]
      );
      await pool.query(
        `INSERT INTO experiment.backtest_runs
         (run_id, spec_id, candidate_id, idempotency_key, status, failure_reason, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [runId, specId, `candidate-${index}`, String(index + 5).repeat(64), status,
          status === "failed" ? "BACKTEST_EXECUTION_FAILED" : null, `request-${index}`]
      );
      if (status === "completed") {
        const resultId = `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
        await pool.query(
          `INSERT INTO experiment.backtest_results
           (result_id, run_id, spec_id, spec_hash, idempotency_key, metric_set, metrics,
            execution_assumptions, trade_content_hash)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)`,
          [resultId, runId, specId, String(index + 1).repeat(64), String(index + 5).repeat(64),
            JSON.stringify({ id: "mvp-metrics", version: "1.0.0" }),
            JSON.stringify({ totalReturn: 0.1, winRate: 0.5, maximumDrawdown: 0.02, numberOfTrades: runId === ids.zero ? 0 : 12 }),
            JSON.stringify({
              initialCapital: 10_000, feeRate: 0.001, slippageRate: 0.0005,
              signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
              leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
              stopLoss: { enabled: false }, takeProfit: { enabled: false },
              sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close",
              decimalPlaces: 8
            }), "f".repeat(64)]
        );
        if (runId === ids.completed) {
          for (let sequence = 0; sequence < 12; sequence += 1) {
            await pool.query(
              `INSERT INTO experiment.backtest_trades (result_id, sequence_number, trade)
               VALUES ($1,$2,$3::jsonb)`, [resultId, sequence, JSON.stringify({
                sequenceNumber: 999,
                direction: sequence % 2 === 0 ? "long" : "short",
                entryTime: sequence * 10, entryPrice: 100 + sequence,
                exitTime: sequence * 10 + 5, exitPrice: 101 + sequence,
                quantity: 1, entryFee: 0.1, exitFee: 0.1, slippage: 0.05,
                profitAndLoss: 0.8, exitReason: "signal"
              })]
            );
          }
        }
      }
    }
    const module = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(BacktestRunService).useValue({})
      .overrideProvider(BacktestResultQuery).useValue(new PostgresBacktestResultQuery(pool))
      .compile();
    application = module.createNestApplication();
    application.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true
    }));
    await application.listen(0, "127.0.0.1");
    baseUrl = await application.getUrl();
  });

  afterAll(async () => { await application?.close(); await pool?.end(); });

  it("returns the stored summary, metrics, assumptions, and specification identity", async () => {
    const response = await fetch(`${baseUrl}/backtests/${ids.completed}/result`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      runId: ids.completed, status: "completed",
      specificationHash: "1".repeat(64),
      metricSet: { id: "mvp-metrics", version: "1.0.0" },
      metrics: { totalReturn: 0.1, numberOfTrades: 12 },
      executionAssumptions: { feeRate: 0.001, fillRule: "next-open" }
    });
  });

  it("pages trades in stable sequence order and returns an empty out-of-range page", async () => {
    const second = await fetch(`${baseUrl}/backtests/${ids.completed}/trades?page=2&pageSize=10`);
    expect(await second.json()).toMatchObject({
      status: "completed", page: { pageNumber: 2, pageSize: 10, totalCount: 12 },
      trades: [{ sequenceNumber: 10 }, { sequenceNumber: 11 }]
    });
    const beyond = await fetch(`${baseUrl}/backtests/${ids.completed}/trades?page=3&pageSize=10`);
    expect(await beyond.json()).toMatchObject({ trades: [], page: { totalCount: 12 } });
  });

  it("returns an empty valid page for a completed result with zero trades", async () => {
    const response = await fetch(`${baseUrl}/backtests/${ids.zero}/trades`);
    expect(await response.json()).toMatchObject({
      status: "completed", trades: [], page: { pageNumber: 1, pageSize: 10, totalCount: 0 }
    });
  });

  it("distinguishes pending, failed, missing, and invalid paging", async () => {
    const pending = await fetch(`${baseUrl}/backtests/${ids.queued}/result`);
    expect(pending.status).toBe(202);
    expect(await pending.json()).toMatchObject({ status: "queued" });
    const failed = await fetch(`${baseUrl}/backtests/${ids.failed}/result`);
    expect(failed.status).toBe(200);
    expect(await failed.json()).toMatchObject({
      status: "failed", failureReason: "BACKTEST_EXECUTION_FAILED"
    });
    expect((await fetch(`${baseUrl}/backtests/${ids.missing}/result`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/backtests/${ids.completed}/trades?pageSize=101`)).status).toBe(400);
  });
});
