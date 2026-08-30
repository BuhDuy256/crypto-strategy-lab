-- Atomic immutable backtest results, provenance, and ordered trade rows.

CREATE TABLE IF NOT EXISTS experiment.backtest_results (
  result_id UUID PRIMARY KEY,
  run_id UUID NOT NULL UNIQUE REFERENCES experiment.backtest_runs(run_id),
  spec_id UUID NOT NULL REFERENCES experiment.specifications(spec_id),
  spec_hash TEXT NOT NULL CHECK (spec_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  metric_set JSONB NOT NULL,
  metrics JSONB NOT NULL,
  execution_assumptions JSONB NOT NULL,
  trade_content_hash TEXT NOT NULL CHECK (trade_content_hash ~ '^[0-9a-f]{64}$'),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiment.backtest_result_provenance (
  result_id UUID PRIMARY KEY REFERENCES experiment.backtest_results(result_id),
  checklist JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment.backtest_trades (
  result_id UUID NOT NULL REFERENCES experiment.backtest_results(result_id),
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
  trade JSONB NOT NULL,
  PRIMARY KEY (result_id, sequence_number)
);

CREATE OR REPLACE FUNCTION experiment.reject_accepted_result_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'accepted backtest results are immutable';
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['backtest_results', 'backtest_result_provenance', 'backtest_trades']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS accepted_rows_are_immutable ON experiment.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER accepted_rows_are_immutable BEFORE UPDATE OR DELETE ON experiment.%I '
      'FOR EACH ROW EXECUTE FUNCTION experiment.reject_accepted_result_mutation()', table_name
    );
  END LOOP;
END;
$$;
