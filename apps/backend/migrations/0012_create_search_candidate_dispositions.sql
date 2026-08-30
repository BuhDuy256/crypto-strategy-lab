-- SEARCH-02: the search layer's own record that a pending candidate was cancelled.
--
-- A cancelled candidate's backtest job lands in backtest_runs.status = 'failed'
-- with a cancellation reason, because BacktestRunStatus has no 'cancelled' member
-- and adding one is a cross-slice change to already-DONE V1 contracts (deferred to
-- V6 SEARCH-07). To still mark pending work cancelled as a first-class, queryable
-- fact at the layer SEARCH-02 owns, a cancellation is recorded here instead. The
-- candidate ledger stays append-only and untouched; this is a separate append-only
-- fact linked back to it, so progress can count cancelled candidates without
-- reading a backtest-job status.

CREATE TABLE IF NOT EXISTS experiment.search_candidate_dispositions (
  spec_id UUID NOT NULL,
  content_hash TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('cancelled')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (spec_id, content_hash),
  FOREIGN KEY (spec_id, content_hash)
    REFERENCES experiment.search_candidates(spec_id, content_hash)
);

CREATE INDEX IF NOT EXISTS search_candidate_dispositions_by_spec
ON experiment.search_candidate_dispositions (spec_id);

-- A disposition is a durable, immutable fact, like the candidate it annotates.
CREATE OR REPLACE FUNCTION experiment.reject_search_disposition_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'search candidate dispositions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS search_dispositions_are_append_only
ON experiment.search_candidate_dispositions;
CREATE TRIGGER search_dispositions_are_append_only
BEFORE UPDATE OR DELETE ON experiment.search_candidate_dispositions
FOR EACH ROW EXECUTE FUNCTION experiment.reject_search_disposition_mutation();
