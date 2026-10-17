-- R5.8.12: re-pin the approved attestation workflow blob without rewriting prior migrations.
-- The exact new workflow source is pinned in Git and the app registry. This migration
-- updates only the three current DB function definitions that enforce the old blob.
-- It fails closed if a target function is missing, mixed, or pinned to an unknown value.
BEGIN;

DO $r5812$
DECLARE
  _old constant text := '523cee5b0fecc21c7ce2b5f538b42670eec3fed1';
  _new constant text := 'f5e8ffb19d03dca410591f8d2fd38dc47a3ca485';
  _target regprocedure;
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure,
    'public.enforce_approved_attestation_workflow()'::regprocedure
  ];
  _definition text;
  _updated text;
  _old_count integer;
  _new_count integer;
BEGIN
  FOREACH _target IN ARRAY _targets LOOP
    _definition := pg_catalog.pg_get_functiondef(_target);
    _old_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old, ''))) / pg_catalog.length(_old);
    _new_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new, ''))) / pg_catalog.length(_new);

    IF _old_count = 0 AND _new_count > 0 THEN
      RAISE NOTICE 'R5_8_12_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _old_count > 0 AND _new_count = 0 THEN
      _updated := pg_catalog.replace(_definition, _old, _new);
      EXECUTE _updated;
      _definition := pg_catalog.pg_get_functiondef(_target);
      IF pg_catalog.strpos(_definition, _old) > 0 OR pg_catalog.strpos(_definition, _new) = 0 THEN
        RAISE EXCEPTION 'R5_8_12_POSTCONDITION_INVALID: %', _target USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_12_REPINNED: % (occurrences=%)', _target, _old_count;
    ELSE
      RAISE EXCEPTION 'R5_8_12_UNEXPECTED_WORKFLOW_PIN_STATE: % old=% new=%', _target, _old_count, _new_count USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5812$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.12 approved attestation workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485; semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3; build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.12 approved attestation workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485; semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3; build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1.';
COMMENT ON FUNCTION public.enforce_approved_attestation_workflow()
  IS 'R5.8.12 approved attestation workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485; semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3; build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1.';

COMMIT;
