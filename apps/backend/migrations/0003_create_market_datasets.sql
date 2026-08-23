-- Immutable Market-owned dataset manifests resolved through candle ingest watermarks.

CREATE TABLE IF NOT EXISTS market.datasets (
  dataset_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  manifest_version TEXT NOT NULL CHECK (manifest_version = 'v1'),
  provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  start_time BIGINT NOT NULL,
  end_time BIGINT NOT NULL,
  revision_watermark BIGINT NOT NULL CHECK (revision_watermark >= 0),
  candle_count INTEGER NOT NULL CHECK (candle_count >= 0),
  gaps JSONB NOT NULL,
  integrity_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id, version),
  UNIQUE (integrity_hash)
);

CREATE OR REPLACE FUNCTION market.reject_dataset_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'market datasets are immutable';
END;
$$;

DROP TRIGGER IF EXISTS datasets_are_immutable ON market.datasets;
CREATE TRIGGER datasets_are_immutable
BEFORE UPDATE OR DELETE ON market.datasets
FOR EACH ROW EXECUTE FUNCTION market.reject_dataset_mutation();
