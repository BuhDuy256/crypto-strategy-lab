// Transport tests for the leaderboard endpoint: the controller passes the sort
// through, maps a missing experiment to 404, and rejects an unknown sort with
// 400. No ranking logic lives here.

import { Test, type TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { LeaderboardResponse, LeaderboardSort } from "@crypto-strategy-lab/api-contracts";
import { LeaderboardController } from "./leaderboard.controller.js";
import { LeaderboardQuery } from "../experiment/index.js";

const specId = "10000000-0000-4000-8000-000000000001";

function response(sort: LeaderboardSort): LeaderboardResponse {
  return { specId, sort, entries: [] };
}

async function controllerWith(query: Partial<LeaderboardQuery>): Promise<LeaderboardController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [LeaderboardController],
    providers: [{ provide: LeaderboardQuery, useValue: query }]
  }).compile();
  return module.get<LeaderboardController>(LeaderboardController);
}

describe("LeaderboardController", () => {
  it("passes the requested sort to the query and returns its response", async () => {
    const getLeaderboard = vi.fn(
      (_specId: string, sort: LeaderboardSort) => Promise.resolve(response(sort))
    );
    const controller = await controllerWith({ getLeaderboard });
    const result = await controller.get(specId, "winRate");
    expect(getLeaderboard).toHaveBeenCalledWith(specId, "winRate");
    expect(result.sort).toBe("winRate");
  });

  it("defaults the sort to rank when none is given", async () => {
    const getLeaderboard = vi.fn(
      (_specId: string, sort: LeaderboardSort) => Promise.resolve(response(sort))
    );
    const controller = await controllerWith({ getLeaderboard });
    await controller.get(specId, "rank");
    expect(getLeaderboard).toHaveBeenCalledWith(specId, "rank");
  });

  it("maps a missing search experiment to 404", async () => {
    const controller = await controllerWith({ getLeaderboard: () => Promise.resolve(undefined) });
    await expect(controller.get(specId, "rank")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects an unknown sort with 400 before touching the query", async () => {
    const getLeaderboard = vi.fn();
    const controller = await controllerWith({ getLeaderboard });
    await expect(controller.get(specId, "sharpe")).rejects.toBeInstanceOf(BadRequestException);
    expect(getLeaderboard).not.toHaveBeenCalled();
  });
});
