// Thin HTTP transport for the derived leaderboard of a search experiment. All
// ranking lives in the Experiment module; this controller maps the sort query
// parameter and a missing experiment to HTTP.

import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query
} from "@nestjs/common";
import {
  LEADERBOARD_SORTS,
  type LeaderboardResponse,
  type LeaderboardSort
} from "@crypto-strategy-lab/api-contracts";
import { LeaderboardQuery } from "../experiment/index.js";

@Controller("experiments")
export class LeaderboardController {
  constructor(@Inject(LeaderboardQuery) private readonly leaderboard: LeaderboardQuery) {}

  @Get(":specId/leaderboard")
  async get(
    @Param("specId", new ParseUUIDPipe()) specId: string,
    @Query("sort", new DefaultValuePipe("rank")) sort: string
  ): Promise<LeaderboardResponse> {
    if (!LEADERBOARD_SORTS.includes(sort as LeaderboardSort)) {
      throw new BadRequestException(`LEADERBOARD_SORT: unknown sort ${sort}`);
    }
    const response = await this.leaderboard.getLeaderboard(specId, sort as LeaderboardSort);
    if (response === undefined) throw new NotFoundException(`SEARCH_RUN_NOT_FOUND: ${specId}`);
    return response;
  }
}
