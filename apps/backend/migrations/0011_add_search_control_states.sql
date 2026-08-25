-- SEARCH-02: durable pause/resume/cancel control states for a search run.
--
-- A search run's control state is durable. The requested state is recorded first
-- and the coordinator converges toward it, so a request survives a coordinator or
-- API restart. The transitional states make convergence observable:
--   running  -> pausing  -> paused        (new submission stops; in-flight drains)
--   *        -> cancelling -> cancelled    (pending work terminated; in-flight drains)
-- 'stopped' remains the terminal state for the natural stop conditions from
-- SEARCH-01. 'paused' is not terminal: a paused run resumes back to 'running'.

-- The status set from 0010 is replaced by the wider control set. The old inline
-- CHECK constraints are dropped by their auto-generated names before the new,
-- explicitly named constraints are added. Every drop uses IF EXISTS and covers
-- the new constraint names too, so the whole file is safe to re-run, matching the
-- idempotent idiom of migration 0010.
ALTER TABLE experiment.search_runs
  DROP CONSTRAINT IF EXISTS search_runs_status_check;
ALTER TABLE experiment.search_runs
  DROP CONSTRAINT IF EXISTS search_runs_check;
ALTER TABLE experiment.search_runs
  DROP CONSTRAINT IF EXISTS search_runs_terminal_check;

ALTER TABLE experiment.search_runs
  ADD CONSTRAINT search_runs_status_check
  CHECK (status IN ('running', 'pausing', 'paused', 'cancelling', 'cancelled', 'stopped'));

-- Terminal bookkeeping. A natural stop records a reason; a cancel does not.
-- Only terminal states (stopped, cancelled) carry stopped_at; the transitional
-- and active states carry neither a reason nor a stop time.
ALTER TABLE experiment.search_runs
  ADD CONSTRAINT search_runs_terminal_check CHECK (
    (status = 'stopped'   AND stop_reason IS NOT NULL AND stopped_at IS NOT NULL) OR
    (status = 'cancelled' AND stop_reason IS NULL     AND stopped_at IS NOT NULL) OR
    (status IN ('running', 'pausing', 'paused', 'cancelling')
       AND stop_reason IS NULL AND stopped_at IS NULL)
  );
