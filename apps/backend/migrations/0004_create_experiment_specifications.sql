-- Editable Experiment drafts that become database-enforced immutable specifications.

CREATE TABLE IF NOT EXISTS experiment.specifications (
  spec_id UUID PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft', 'frozen')),
  content JSONB NOT NULL,
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_at TIMESTAMPTZ,
  CHECK (
    (status = 'draft' AND content_hash IS NULL AND frozen_at IS NULL) OR
    (status = 'frozen' AND content_hash ~ '^[0-9a-f]{64}$' AND frozen_at IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION experiment.reject_frozen_specification_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'frozen' THEN
    RAISE EXCEPTION 'experiment specifications are immutable after freeze';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS frozen_specifications_are_immutable ON experiment.specifications;
CREATE TRIGGER frozen_specifications_are_immutable
BEFORE UPDATE OR DELETE ON experiment.specifications
FOR EACH ROW EXECUTE FUNCTION experiment.reject_frozen_specification_mutation();
