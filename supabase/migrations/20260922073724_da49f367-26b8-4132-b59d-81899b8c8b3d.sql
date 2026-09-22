REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.canonical_mapping_inventory_releases FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.canonical_mapping_inventory_release_rows FROM service_role;
GRANT SELECT ON TABLE public.canonical_mapping_inventory_releases TO service_role;
GRANT SELECT ON TABLE public.canonical_mapping_inventory_release_rows TO service_role;

DO $migration$
DECLARE
  _release public.canonical_mapping_inventory_releases%ROWTYPE;
  _row_count integer;
  _unique_count integer;
  _generic_count integer;
  _authorized_count integer;
  _verified_count integer;
BEGIN
  SELECT * INTO _release
  FROM public.canonical_mapping_inventory_releases
  WHERE release_id = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87'::uuid
    AND authoritative_candidate;

  SELECT count(*),
         count(DISTINCT canonical_field),
         count(*) FILTER (
           WHERE lower(source_field) IN ('derived_or_constant', 'generic', 'unknown')
              OR btrim(source_field) = ''
         ),
         count(*) FILTER (WHERE canonical_authorization),
         count(*) FILTER (
           WHERE parity_status = 'VERIFIED'
             AND determinism_status = 'VERIFIED'
         )
  INTO _row_count, _unique_count, _generic_count, _authorized_count, _verified_count
  FROM public.canonical_mapping_inventory_release_rows
  WHERE release_id = _release.release_id;

  IF _release.release_id IS NULL
     OR _release.inventory_version <> 'canonical-demo-v2'
     OR _release.schema_version <> 2
     OR _release.inventory_digest <> 'cf0549c2dfbdc4df25b42ce8204edf8705071c586e99696e9ef596c1e742d7b1'
     OR _release.matrix_digest <> 'a276b0306c05ca6a2555db8b3c055bff2df6262b3e2bafccf6d1b5cca8425702'
     OR _release.generator_revision <> 'scripts/canonical_mapping_gate.py:v2'
     OR _release.generator_commit <> '7443ffd0d21675cef72c9eaca8ed0c6d5f925021'
     OR _release.status <> 'BLOCKED'
     OR _release.row_count <> 105
     OR _release.generic_count <> 0
     OR _release.authorized_count <> 0
     OR _release.verified_count <> 0
     OR _row_count <> 105
     OR _unique_count <> 105
     OR _generic_count <> 0
     OR _authorized_count <> 0
     OR _verified_count <> 0 THEN
    RAISE EXCEPTION 'CANONICAL_MAPPING_RELEASE_SEED_MISMATCH' USING ERRCODE = '55000';
  END IF;
END;
$migration$;