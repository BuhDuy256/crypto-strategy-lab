-- Annotations bounded and stored per result
CREATE TABLE IF NOT EXISTS experiment.backtest_annotations (
  result_id UUID PRIMARY KEY REFERENCES experiment.backtest_results(result_id),
  annotations JSONB NOT NULL
);

DO $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS accepted_rows_are_immutable ON experiment.backtest_annotations');
  EXECUTE format(
    'CREATE TRIGGER accepted_rows_are_immutable BEFORE UPDATE OR DELETE ON experiment.backtest_annotations '
    'FOR EACH ROW EXECUTE FUNCTION experiment.reject_accepted_result_mutation()'
  );
END;
$$;
