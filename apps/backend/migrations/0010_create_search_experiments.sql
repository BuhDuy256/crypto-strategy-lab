-- Durable search-experiment run state and the append-only candidate ledger.
--
-- A search run is one row per experiment specification (so an experiment cannot
-- be started twice). The candidate ledger is append-only: each row records one
-- generated candidate, the per-candidate frozen specification derived from it,
-- and the backtest run it was submitted as. The ledger is the idempotency record
-- that lets a killed coordinator resume without duplicating candidates.

CREATE TABLE IF NOT EXISTS experiment.search_runs (
  spec_id UUID PRIMARY KEY REFERENCES experiment.specifications(spec_id),
  status TEXT NOT NULL CHECK (status IN ('running', 'stopped')),
  stop_reason TEXT CHECK (
    stop_reason IN ('max-candidates', 'max-duration', 'no-improvement', 'exhausted')
  ),
  correlation_id TEXT NOT NULL,
  -- No-improvement tracker, folded forward from durable candidate outcomes.
  best_score DOUBLE PRECISION,
  no_improvement_count INTEGER NOT NULL DEFAULT 0 CHECK (no_improvement_count >= 0),
  folded_sequence BIGINT NOT NULL DEFAULT -1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ,
  CHECK (
    (status = 'running' AND stop_reason IS NULL AND stopped_at IS NULL) OR
    (status = 'stopped' AND stop_reason IS NOT NULL AND stopped_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS experiment.search_candidates (
  spec_id UUID NOT NULL REFERENCES experiment.search_runs(spec_id),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  sequence_number BIGINT NOT NULL CHECK (sequence_number >= 0),
  candidate JSONB NOT NULL,
  derived_spec_id UUID NOT NULL REFERENCES experiment.specifications(spec_id),
  run_id UUID NOT NULL REFERENCES experiment.backtest_runs(run_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (spec_id, content_hash),
  UNIQUE (spec_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS search_candidates_by_run
ON experiment.search_candidates (run_id);

CREATE INDEX IF NOT EXISTS search_candidates_by_sequence
ON experiment.search_candidates (spec_id, sequence_number);

-- A stored candidate is immutable: it is the durable record that a candidate was
-- generated and submitted, and nothing may edit or delete it.
CREATE OR REPLACE FUNCTION experiment.reject_search_candidate_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'search candidates are append-only';
END;
$$;

DROP TRIGGER IF EXISTS search_candidates_are_append_only ON experiment.search_candidates;
CREATE TRIGGER search_candidates_are_append_only
BEFORE UPDATE OR DELETE ON experiment.search_candidates
FOR EACH ROW EXECUTE FUNCTION experiment.reject_search_candidate_mutation();
