import { DATASET_SERVICE } from "../apps/backend/src/modules/market/application/tokens.js";
import { StrategyRegistry } from "../apps/backend/src/modules/strategy/index.js";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiModule } from "../apps/backend/src/modules/api/index.js";
import { resetTestDatabase } from "../apps/backend/src/platform/test-database.js";
import type { CreateSpecificationRequest } from "@crypto-strategy-lab/api-contracts";


const NATIVE_FETCH = globalThis.fetch;

describe("POST /specifications", () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    await resetTestDatabase("experiment");
    const module = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(DATASET_SERVICE)
      .useValue({ resolveDataset: async () => ({}) })
      .overrideProvider(StrategyRegistry)
      .useValue({ resolve: () => ({ validateParameters: () => {}, descriptor: { requiredInputs: [] } }) })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.listen(0);
    port = app.getHttpServer().address().port;
    
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const remappedUrl = url.replace("http://localhost/api", `http://127.0.0.1:${port}`);
      return NATIVE_FETCH(remappedUrl, init);
    };
  });

  afterAll(async () => {
    globalThis.fetch = NATIVE_FETCH;
    await app.close();
  });

  it("creates and freezes a specification", async () => {
    const request: CreateSpecificationRequest = {
      schemaVersion: "v1",
      datasetRef: { datasetId: "ds-1", version: 1, manifestVersion: "v1", provider: "binance", symbols: ["BTCUSDT"], timeframe: "1h", range: { startTime: 0, endTime: 1 }, revisionWatermark: 1, integrityHash: "hash" },
      strategy: {
        id: "ma-crossover",
        version: "1.0.0",
        parameters: { fastPeriod: 10, slowPeriod: 20 }
      },
      execution: {
        initialCapital: 1000,
        feeRate: 0.001,
        slippageRate: 0.001,
        signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
        leverage: 1,
        positionSizing: "available-equity",
        allowedDirections: ["long", "short"],
        stopLoss: { enabled: false },
        takeProfit: { enabled: false },
        sameBarExitPriority: "stop-loss-first",
        finalPositionPolicy: "liquidate-at-final-close",
        decimalPlaces: 8
      },
      metricSet: { id: "core", version: "1.0.0" }
    };

    const response = await fetch(`http://127.0.0.1:${port}/specifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("specId");
    expect(typeof body.specId).toBe("string");
  });
});
