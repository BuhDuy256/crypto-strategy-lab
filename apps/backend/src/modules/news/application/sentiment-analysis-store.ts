// News-owned persistence seam for the inference lifecycle.
//
// The analyzer stage reaches durable state only through this port. It claims work,
// commits one result with its state transition, or records one durable failure.
// A future V6 outbox row belongs inside the same commit without changing the stage.

import type { NewsItem } from "../domain/news-item.js";
import type { SentimentResult } from "../domain/sentiment-result.js";

export interface ClaimedNewsItem {
  readonly item: NewsItem;
  /** Monotonic attempt number for this item, used to bound retries. */
  readonly attempt: number;
  readonly analyzerId: string;
  /** ISO 8601 timestamp at which another stage may reclaim the item. */
  readonly leaseExpiresAt: string;
}

/** The retry decision belongs to the application policy; the store only executes it. */
export interface SentimentAnalysisFailure {
  readonly reason: string;
  readonly nextState: "pending" | "degraded";
}

export interface SentimentAnalysisStore {
  /** Claims up to `batchSize` claimable items under a lease, opening one attempt each. */
  claimPendingItems(analyzerId: string, batchSize: number): Promise<readonly ClaimedNewsItem[]>;
  /** Commits one result, its attempt outcome, and the analyzed transition atomically. */
  commitResult(claim: ClaimedNewsItem, result: SentimentResult): Promise<void>;
  /** Records one durable failed attempt and the resulting item state atomically. */
  recordFailure(claim: ClaimedNewsItem, failure: SentimentAnalysisFailure): Promise<void>;
}
