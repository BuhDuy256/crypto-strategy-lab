-- Durable V1 PostgreSQL-backed backtest queue and immutable attempt history.

CREATE TABLE IF NOT EXISTS experiment.backtest_runs (
  run_id UUID PRIMARY KEY,
  spec_id UUID NOT NULL REFERENCES experiment.specifications(spec_id),
  candidate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  failure_reason TEXT,
  correlation_id TEXT NOT NULL,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  ,CHECK ((status = 'failed' AND failure_reason IS NOT NULL) OR (status <> 'failed' AND failure_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS backtest_runs_claimable
ON experiment.backtest_runs (status, created_at);

CREATE TABLE IF NOT EXISTS experiment.backtest_attempts (
  run_id UUID NOT NULL REFERENCES experiment.backtest_runs(run_id),
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  runner_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  PRIMARY KEY (run_id, attempt_number)
);
