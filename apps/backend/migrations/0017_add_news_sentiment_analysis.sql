-- Widens the News analysis lifecycle and adds News-owned sentiment result and attempt history.
--
-- 0016 permitted only the `pending` analysis state, which is correct for collection but
-- leaves an item unable to leave that state. This forward migration defines the whole
-- lifecycle instead of editing 0016, which is already applied:
--
--   pending   - collected, not analyzed yet, claimable by an analyzer stage.
--   analyzing - claimed by one analyzer stage under a lease; reclaimable once it expires.
--   analyzed  - a sentiment result is committed for the item. Terminal success.
--   degraded  - bounded retries were exhausted with no result. This is the visible
--               degraded state that replaces a silent gap.
--
-- A failure that still has retries left returns the item to `pending`, so no separate
-- "retryable" state is needed. Existing rows are all `pending` and stay valid untouched.

ALTER TABLE news.items DROP CONSTRAINT IF EXISTS items_analysis_state_check;

ALTER TABLE news.items
ADD CONSTRAINT items_analysis_state_check
CHECK (analysis_state IN ('pending', 'analyzing', 'analyzed', 'degraded'));

-- Lease and attempt bookkeeping, mirroring the EXP-04 backtest claim columns.
ALTER TABLE news.items ADD COLUMN IF NOT EXISTS analysis_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news.items ADD COLUMN IF NOT EXISTS analysis_claimed_by TEXT;
ALTER TABLE news.items ADD COLUMN IF NOT EXISTS analysis_lease_expires_at TIMESTAMPTZ;
ALTER TABLE news.items ADD COLUMN IF NOT EXISTS analysis_failure_reason TEXT;

CREATE INDEX IF NOT EXISTS news_items_claimable
ON news.items (analysis_state, collected_at);

-- One committed result per news item. The primary key is a second, durable guarantee
-- that one item is never analyzed twice, independent of the claim.
CREATE TABLE IF NOT EXISTS news.sentiment_results (
  news_item_id TEXT PRIMARY KEY REFERENCES news.items(id),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  label TEXT NOT NULL CHECK (label IN ('positive', 'neutral', 'negative')),
  score DOUBLE PRECISION NOT NULL CHECK (score >= -1 AND score <= 1),
  model_id TEXT NOT NULL CHECK (model_id <> ''),
  model_artifact_id TEXT NOT NULL CHECK (model_artifact_id <> ''),
  model_version TEXT NOT NULL CHECK (model_version <> ''),
  input_version TEXT NOT NULL CHECK (input_version <> ''),
  preprocessing_version TEXT NOT NULL CHECK (preprocessing_version <> ''),
  analyzed_at BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded'))
);

-- Immutable history of every inference attempt, including failures and lost leases.
CREATE TABLE IF NOT EXISTS news.sentiment_analysis_attempts (
  news_item_id TEXT NOT NULL REFERENCES news.items(id),
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  analyzer_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('succeeded', 'failed', 'lease_expired')),
  failure_reason TEXT,
  PRIMARY KEY (news_item_id, attempt_number)
);
