// News-owned persistence seam for one transactionally committed collection batch.
//
// A future V6 outbox belongs behind this seam in the same transaction; the
// collector will continue to know only this operation.

import type { NewsItem } from "../domain/news-item.js";
import type { NewsProviderHealth } from "./news-provider.js";

export interface CollectedNewsBatch {
  readonly items: readonly NewsItem[];
  readonly health: NewsProviderHealth;
}

export interface StoredNewsBatch {
  readonly storedCount: number;
  readonly skippedCount: number;
}

export interface NewsCollectionStore {
  /** Stores normalized items and source health atomically. */
  storeCollectedBatch(batch: CollectedNewsBatch): Promise<StoredNewsBatch>;
}
