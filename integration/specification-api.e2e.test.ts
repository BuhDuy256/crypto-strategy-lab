// End-to-end proof that the public specification API creates one real,
// reproducible single-backtest specification through the repository-owned
// Market, Strategy, and Experiment paths.

import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  isCreateSpecificationResponse,
  type CreateSpecificationRequest
} from "../packages/api-contracts/src/index.js";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiModule } from "../apps/backend/src/modules/api/index.js";
import {
  ExperimentSpecificationService,
  MVP_METRIC_SET
} from "../apps/backend/src/modules/experiment/index.js";
import {
  DATASET_SERVICE,
  MARKET_DATA_PROVIDER,
  MarketBackfillService,
  type Candle,
  type DatasetService
} from "../apps/backend/src/modules/market/index.js";
import { StrategyRegistry } from "../apps/backend/src/modules/strategy/index.js";
import { resetTestDatabase } from "../apps/backend/src/platform/test-database.js";

const HOUR = 3_600_000;
const START = Date.UTC(2024, 0, 1);
const END = START + 3 * HOUR;
const DEPENDENCY_LOCK_HASH = "a".repeat(64);
const APPLICATION_COMMIT = "application-test-commit";
const WORKER_COMMIT = "worker-test-commit";

const candles: readonly Candle[] = [100, 102, 101, 104].map((close, index) => ({
  provider: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  openTime: START + index * HOUR,
  closeTime: START + (index + 1) * HOUR - 1,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: 10 + index,
  closed: true,
  revision: 1
}));

const request: CreateSpecificationRequest = {
  schemaVersion: "v1",
  dataset: {
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    startTime: START,
    endTime: END
  },
  strategy: {
    id: "moving-average",
    version: "1.0.0",
    parameters: { fastPeriod: 2, slowPeriod: 3, priceSource: "close" }
  }
};

describe("POST /specifications", () => {
  let pool: Pool;
  let application: INestApplication;
  let baseUrl: string;
  const fetchHistorical = vi.fn(async () => candles);

  beforeAll(async () => {
    vi.stubEnv("DEPENDENCY_LOCK_HASH", DEPENDENCY_LOCK_HASH);
    vi.stubEnv("APPLICATION_COMMIT", APPLICATION_COMMIT);
    vi.stubEnv("WORKER_COMMIT", WORKER_COMMIT);
    vi.stubEnv("DETERMINISTIC_CONFIG_VERSION", "1.0.0");

    pool = await resetTestDatabase();
    const module = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(MARKET_DATA_PROVIDER)
      .useValue({ fetchHistorical })
      .compile();
    application = module.createNestApplication();
    application.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await application
      .get(MarketBackfillService)
      .backfill({ symbol: "BTCUSDT", timeframe: "1h", startTime: START, endTime: END });
    await application.listen(0, "127.0.0.1");
    baseUrl = await application.getUrl();
  }, 30_000);

  afterAll(async () => {
    await application?.close();
    await pool?.end();
    vi.unstubAllEnvs();
  });

  async function createSpecification(): Promise<string> {
    const response = await fetch(`${baseUrl}/specifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(isCreateSpecificationResponse(body)).toBe(true);
    if (!isCreateSpecificationResponse(body)) {
      throw new Error("expected a CreateSpecificationResponse");
    }
    return body.specId;
  }

  it("freezes the real dataset, registered strategy, execution defaults, and runtime provenance", async () => {
    const specId = await createSpecification();
    const stored = await application.get(ExperimentSpecificationService).get(specId);
    expect(stored.status).toBe("frozen");
    if (stored.status !== "frozen") throw new Error("expected a frozen specification");

    expect(fetchHistorical).toHaveBeenCalledWith({
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: START,
      endTime: END
    });
    expect(application.get(StrategyRegistry).resolve(stored.content.strategy).descriptor.id)
      .toBe("moving-average");

    const datasetRef = stored.content.datasetRef;
    expect(datasetRef.datasetId).toBe(`sha256:${datasetRef.integrityHash}`);
    expect(datasetRef.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(datasetRef.range).toEqual({ startTime: START, endTime: END });
    const resolved = await application.get<DatasetService>(DATASET_SERVICE).resolveDataset(datasetRef);
    expect(resolved.candles).toEqual(candles);

    expect(stored.content.strategy).toEqual(request.strategy);
    expect(stored.content.execution).toEqual({
      initialCapital: 10_000,
      feeRate: 0.001,
      slippageRate: 0.0005,
      signalTiming: "close-of-bar",
      fillRule: "next-open",
      maxConcurrentPositions: 1,
      leverage: 1,
      positionSizing: "available-equity",
      allowedDirections: ["long", "short"],
      stopLoss: { enabled: false },
      takeProfit: { enabled: false },
      sameBarExitPriority: "stop-loss-first",
      finalPositionPolicy: "liquidate-at-final-close",
      decimalPlaces: 8
    });
    expect(stored.content.metricSet).toEqual({
      id: MVP_METRIC_SET.id,
      version: MVP_METRIC_SET.version
    });
    expect(stored.content.search).toBeUndefined();
    expect(stored.content.provenance).toEqual({
      engine: { id: "backtester", version: "1.0.0" },
      nodeRuntimeVersion: process.versions.node,
      dependencyLockHash: DEPENDENCY_LOCK_HASH,
      applicationCommit: APPLICATION_COMMIT,
      workerCommit: WORKER_COMMIT,
      deterministicConfigVersion: "1.0.0"
    });
    expect(stored.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creates the same frozen content hash for the same request", async () => {
    const first = await application.get(ExperimentSpecificationService).get(await createSpecification());
    const second = await application.get(ExperimentSpecificationService).get(await createSpecification());
    expect(first.status).toBe("frozen");
    expect(second.status).toBe("frozen");
    if (first.status !== "frozen" || second.status !== "frozen") {
      throw new Error("expected frozen specifications");
    }
    expect(second.contentHash).toBe(first.contentHash);
  });

  it("rejects an unversioned request at the transport edge", async () => {
    const unversioned = { dataset: request.dataset, strategy: request.strategy };
    const response = await fetch(`${baseUrl}/specifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unversioned)
    });
    expect(response.status).toBe(400);
  });
});
