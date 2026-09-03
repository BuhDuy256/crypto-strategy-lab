-- Durable normalized News collection state owned only by News Intelligence.
--
-- `news.items` preserves the deterministic NEWS-01 identity. Collection inserts
-- only; analysis stages in later slices may advance analysis state but must never
-- overwrite the normalized source item. `news.source_health` is the current
-- observable state of one configured source.

CREATE TABLE IF NOT EXISTS news.items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at BIGINT NOT NULL,
  collected_at BIGINT NOT NULL,
  related_coins JSONB NOT NULL CHECK (jsonb_typeof(related_coins) = 'array'),
  url TEXT NOT NULL,
  analysis_state TEXT NOT NULL CHECK (analysis_state IN ('pending')),
  CHECK (id = source || '|' || url),
  UNIQUE (source, url)
);

CREATE TABLE IF NOT EXISTS news.source_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unavailable')),
  reason TEXT,
  changed_at BIGINT NOT NULL,
  checked_at BIGINT NOT NULL
);
