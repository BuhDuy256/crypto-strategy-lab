// HTTP contract proof for durable backtest start and status reads.

import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiModule } from "../apps/backend/src/modules/api/index.js";
import { BacktestRunService, type BacktestRun } from "../apps/backend/src/modules/experiment/index.js";

const run: BacktestRun = {
  runId: "20000000-0000-4000-8000-000000000001",
  specId: "10000000-0000-4000-8000-000000000001",
  candidateId: "candidate",
  idempotencyKey: "a".repeat(64),
  status: "queued",
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z"
};

describe("backtest HTTP API", () => {
  let application: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const service = {
      start: async () => run,
      get: async (runId: string) => runId === run.runId
        ? { ...run, status: "failed" as const, failureReason: "worker stopped" }
        : Promise.reject(new Error(`BACKTEST_RUN_NOT_FOUND: ${runId}`))
    };
    const module = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(BacktestRunService)
      .useValue(service)
      .compile();
    application = module.createNestApplication();
    application.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await application.listen(0, "127.0.0.1");
    baseUrl = await application.getUrl();
  });

  afterAll(async () => { await application?.close(); });

  it("starts a frozen specification and serializes status including failure reason", async () => {
    const started = await fetch(`${baseUrl}/backtests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ specId: run.specId })
    });
    expect(started.status).toBe(201);
    expect(await started.json()).toMatchObject({ runId: run.runId, status: "queued" });

    const status = await fetch(`${baseUrl}/backtests/${run.runId}`);
    expect(await status.json()).toMatchObject({ status: "failed", failureReason: "worker stopped" });
  });

  it("rejects malformed run identifiers before querying storage", async () => {
    const response = await fetch(`${baseUrl}/backtests/not-a-uuid`);
    expect(response.status).toBe(400);
  });
});
