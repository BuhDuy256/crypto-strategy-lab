// Transport mapping for the NEWS-06 single-backtest candidate configuration.

import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { CreateSpecificationRequest } from "@crypto-strategy-lab/api-contracts";
import { SingleBacktestExperimentCreationService } from "../experiment/index.js";
import { SpecificationController } from "./specification.controller.js";

function request(): CreateSpecificationRequest {
  return {
    schemaVersion: "v1",
    dataset: {
      provider: "binance", symbol: "BTCUSDT", timeframe: "1h", startTime: 0, endTime: 3_600_000
    },
    strategy: {
      id: "news-sentiment",
      version: "1.0.0",
      parameters: { positiveThreshold: 0.2, negativeThreshold: -0.2, windowDurationMs: 3_600_000 }
    },
    sentimentInput: {
      windowDurationMs: 3_600_000,
      policy: {
        maxAgeMs: 300_000,
        onMissing: { action: "substitute", substituteValue: 0 },
        onStale: { action: "degrade" }
      }
    }
  };
}

async function controllerWith(
  create: SingleBacktestExperimentCreationService["create"]
): Promise<SpecificationController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [SpecificationController],
    providers: [{ provide: SingleBacktestExperimentCreationService, useValue: { create } }]
  }).compile();
  return module.get(SpecificationController);
}

describe("SpecificationController", () => {
  it("passes a News candidate's explicit frozen sentiment configuration to Experiment", async () => {
    const create = vi.fn(async () => ({ specId: "spec-1" }));
    const controller = await controllerWith(create);

    await expect(controller.create(request() as never)).resolves.toEqual({ specId: "spec-1" });

    expect(create).toHaveBeenCalledWith({
      dataset: {
        provider: "binance", symbol: "BTCUSDT", timeframe: "1h", range: { startTime: 0, endTime: 3_600_000 }
      },
      strategy: {
        id: "news-sentiment",
        version: "1.0.0",
        parameters: { positiveThreshold: 0.2, negativeThreshold: -0.2, windowDurationMs: 3_600_000 }
      },
      sentimentInput: {
        windowDurationMs: 3_600_000,
        policy: {
          maxAgeMs: 300_000,
          onMissing: { action: "substitute", substituteValue: 0 },
          onStale: { action: "degrade" }
        }
      }
    });
  });
});
