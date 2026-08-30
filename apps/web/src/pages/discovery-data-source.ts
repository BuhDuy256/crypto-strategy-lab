// The read side of the Discovery page, isolated behind one interface so the
// source can be swapped without touching the components.
//
// In V3 the source polls the durable progress snapshot and the leaderboard
// projection. V6's SEARCH-06 replaces the poll with a push of the same snapshot
// shapes; the page keeps rendering the same data, so only this module changes.

import type {
  LeaderboardResponse,
  LeaderboardSort,
  SearchProgressResponse
} from "@crypto-strategy-lab/api-contracts";
import { getLeaderboard, getSearchProgress } from "../api/client.js";

export interface SearchDataSource {
  getProgress(specId: string): Promise<SearchProgressResponse>;
  getLeaderboard(specId: string, sort: LeaderboardSort): Promise<LeaderboardResponse>;
}

// The default V3 source: it reads durable state over HTTP on a poll.
export const pollingSearchDataSource: SearchDataSource = {
  getProgress: (specId) => getSearchProgress(specId),
  getLeaderboard: (specId, sort) => getLeaderboard(specId, sort)
};
