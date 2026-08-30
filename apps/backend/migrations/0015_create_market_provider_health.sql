-- Provider health owned by Market Data.
--
-- Ingest and the API are separate processes, and Redis is explicitly ephemeral,
-- so the only place both can agree on provider health is PostgreSQL. One row
-- per provider holds the current state; `changed_at` is when the status last
-- became what it is now, `checked_at` is the last time ingest reported.

CREATE TABLE IF NOT EXISTS market.provider_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unavailable')),
  reason TEXT,
  changed_at BIGINT NOT NULL,
  checked_at BIGINT NOT NULL
);
