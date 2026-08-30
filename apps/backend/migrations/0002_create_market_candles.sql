-- Immutable normalized candle revisions owned exclusively by Market Data.
-- `revision` is local to one logical candle. `ingest_sequence` is the global
-- ordering used by DatasetRef revision watermarks.

CREATE TABLE IF NOT EXISTS market.candles (
  provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open_time BIGINT NOT NULL,
  close_time BIGINT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL,
  closed BOOLEAN NOT NULL CHECK (closed),
  revision BIGINT NOT NULL CHECK (revision >= 1),
  ingest_sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, symbol, timeframe, open_time, revision),
  UNIQUE (ingest_sequence)
);

CREATE INDEX IF NOT EXISTS candles_range_idx
  ON market.candles (provider, symbol, timeframe, open_time);
