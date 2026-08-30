-- Runner cancellation, correlation, and lease lifecycle added after the durable queue baseline.

ALTER TABLE experiment.backtest_runs
ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE experiment.backtest_attempts
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

UPDATE experiment.backtest_attempts a
SET correlation_id = r.correlation_id
FROM experiment.backtest_runs r
WHERE a.run_id = r.run_id AND a.correlation_id IS NULL;

ALTER TABLE experiment.backtest_attempts
ALTER COLUMN correlation_id SET NOT NULL;
