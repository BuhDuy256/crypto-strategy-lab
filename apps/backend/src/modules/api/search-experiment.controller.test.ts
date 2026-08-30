// Transport tests for the search-experiment creation endpoint: the controller
// maps the request to the creation service input and maps a configuration error
// to 400 Bad Request.

import { Test, type TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CreateSearchExperimentRequest } from "@crypto-strategy-lab/api-contracts";
import { SearchExperimentController } from "./search-experiment.controller.js";
import { SearchExperimentCreationService } from "../experiment/index.js";

function request(): CreateSearchExperimentRequest {
  return {
    dataset: { provider: "binance", symbol: "BTCUSDT", timeframe: "1h", startTime: 1000, endTime: 2000 },
    generator: { id: "random-search", version: "1.0.0", configuration: {} },
    searchSpace: {
      strategies: [{ id: "rsi", version: "1.0.0" }],
      compositeSizes: [1],
      policies: []
    },
    seed: "seed-1",
    stopConditions: { maxCandidates: 20 },
    maxInFlight: 2
  };
}

async function controllerWith(
  create: SearchExperimentCreationService["create"]
): Promise<SearchExperimentController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [SearchExperimentController],
    providers: [{ provide: SearchExperimentCreationService, useValue: { create } }]
  }).compile();
  return module.get<SearchExperimentController>(SearchExperimentController);
}

describe("SearchExperimentController", () => {
  it("maps the request to the creation input and returns the spec id", async () => {
    const create = vi.fn(() => Promise.resolve({ specId: "spec-1" }));
    const controller = await controllerWith(create);
    const response = await controller.create(request());
    expect(response).toEqual({ specId: "spec-1" });
    expect(create).toHaveBeenCalledWith({
      dataset: {
        provider: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        range: { startTime: 1000, endTime: 2000 }
      },
      generator: { id: "random-search", version: "1.0.0", configuration: {} },
      searchSpace: {
        strategies: [{ id: "rsi", version: "1.0.0" }],
        compositeSizes: [1],
        policies: []
      },
      seed: "seed-1",
      stopConditions: { maxCandidates: 20 },
      maxInFlight: 2
    });
  });

  it("maps a configuration error to 400 Bad Request", async () => {
    const controller = await controllerWith(() =>
      Promise.reject(new Error("SEARCH_EXPERIMENT_NO_STOP_CONDITION: at least one stop condition is required"))
    );
    await expect(controller.create(request())).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps an unknown base strategy to 400 Bad Request", async () => {
    const controller = await controllerWith(() =>
      Promise.reject(new Error("STRATEGY_NOT_FOUND: rsi@9.9.9"))
    );
    await expect(controller.create(request())).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a malformed body with 400 before reaching the service", async () => {
    const create = vi.fn(() => Promise.resolve({ specId: "spec-1" }));
    const controller = await controllerWith(create);
    const malformed = { generator: {}, seed: "s", maxInFlight: 1 } as never;
    await expect(controller.create(malformed)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
