// Public Experiment read port for the derived leaderboard of one search
// experiment. It reads the projection SEARCH-04 maintains; it performs no metric
// or ranking calculation. Sorting by a metric is a display concern that reorders
// the returned entries without changing the stored ranking-policy rank.

import type { LeaderboardResponse, LeaderboardSort } from "@crypto-strategy-lab/api-contracts";

export abstract class LeaderboardQuery {
  // Returns the leaderboard snapshot, or undefined when no search experiment
  // exists for `specId` so the transport can answer with a clear client error.
  abstract getLeaderboard(
    specId: string,
    sort: LeaderboardSort
  ): Promise<LeaderboardResponse | undefined>;
}
