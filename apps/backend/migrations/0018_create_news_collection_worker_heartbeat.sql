-- News-owned liveness record for the normal collection/analysis worker process.
-- Source health remains a provider observation; this single row records only whether
-- the worker is still running independently of an in-flight provider request.

CREATE TABLE IF NOT EXISTS news.collection_worker_heartbeat (
  worker_id TEXT PRIMARY KEY CHECK (worker_id = 'news-worker'),
  checked_at BIGINT NOT NULL
);
