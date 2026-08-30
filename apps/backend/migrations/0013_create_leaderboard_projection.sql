-- Derived Top-K leaderboard projection.
--
-- This table is NOT authoritative. It is rebuildable from authoritative backtest
-- results at any time, and the leaderboard projector is the only writer. Each row
-- links to the immutable result and the frozen per-candidate specification it was
-- derived from, so the whole board can be traced back to Experiment truth.
--
-- One leaderboard per search experiment: `leaderboard_id` is the base search
-- specification. `content_hash` is the candidate identity within that
-- leaderboard, so at most one row per candidate. `aggregate_version` is the
-- backtest attempt that produced the linked result; the projector uses it to
-- ignore a duplicate or an out-of-order (stale) application.

CREATE TABLE IF NOT EXISTS experiment.leaderboard_entries (
  leaderboard_id UUID NOT NULL REFERENCES experiment.search_runs(spec_id),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  result_id UUID NOT NULL REFERENCES experiment.backtest_results(result_id),
  run_id UUID NOT NULL REFERENCES experiment.backtest_runs(run_id),
  derived_spec_id UUID NOT NULL REFERENCES experiment.specifications(spec_id),
  rank INTEGER NOT NULL CHECK (rank >= 1),
  score DOUBLE PRECISION NOT NULL,
  metrics JSONB NOT NULL,
  policy JSONB NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (leaderboard_id, content_hash),
  UNIQUE (leaderboard_id, rank)
);

CREATE INDEX IF NOT EXISTS leaderboard_entries_by_result
ON experiment.leaderboard_entries (result_id);

-- Highest result version applied per candidate, whether or not that candidate is
-- currently in the Top-K. This is the projector's idempotency record: it lets a
-- duplicate or an out-of-order (stale) application be ignored even for a candidate
-- that was displaced from the board or never entered it. Without it, the guard
-- could only see candidates still on the board. This is the V6 duplicate-safety
-- property this slice builds before V6 needs it.
CREATE TABLE IF NOT EXISTS experiment.leaderboard_applied_versions (
  leaderboard_id UUID NOT NULL REFERENCES experiment.search_runs(spec_id),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 0),
  PRIMARY KEY (leaderboard_id, content_hash)
);
