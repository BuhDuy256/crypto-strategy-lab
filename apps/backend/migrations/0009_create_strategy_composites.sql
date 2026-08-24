CREATE TABLE strategy.composites (
  id VARCHAR(255) PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  components JSONB NOT NULL,
  policy JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
