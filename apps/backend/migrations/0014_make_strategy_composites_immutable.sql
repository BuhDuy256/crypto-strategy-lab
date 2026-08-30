-- Saved composite definitions are immutable inputs referenced by id and version.

CREATE OR REPLACE FUNCTION strategy.reject_composite_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'strategy composites are immutable';
END;
$$;

DROP TRIGGER IF EXISTS composites_are_immutable ON strategy.composites;
CREATE TRIGGER composites_are_immutable
BEFORE UPDATE OR DELETE ON strategy.composites
FOR EACH ROW EXECUTE FUNCTION strategy.reject_composite_mutation();
