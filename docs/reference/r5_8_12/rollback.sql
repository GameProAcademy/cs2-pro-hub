-- R5.8.12 rollback. Use only with explicit release-owner authorization.
-- This restores the exact R5.8.11/R5.8.11b function-body pins. It does not touch rows,
-- grants, owners, triggers, indexes, or retention data. Unknown/mixed states fail closed.
DO $r5812_rollback$
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
  _old_count integer;
  _new_count integer;
  _md5 text;
BEGIN
  FOREACH _target IN ARRAY _targets LOOP
    _definition := pg_catalog.pg_get_functiondef(_target);
    _old_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old, ''))) / pg_catalog.length(_old);
    _new_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new, ''))) / pg_catalog.length(_new);
    IF _old_count = 0 AND _new_count = 2 THEN
      EXECUTE pg_catalog.replace(_definition, _new, _old);
    ELSIF _old_count = 2 AND _new_count = 0 THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'R5_8_12_ROLLBACK_UNEXPECTED_PIN_STATE: % old=% new=%', _target, _old_count, _new_count USING ERRCODE = '55000';
    END IF;
    _definition := pg_catalog.pg_get_functiondef(_target);
    _old_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old, ''))) / pg_catalog.length(_old);
    _new_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new, ''))) / pg_catalog.length(_new);
    IF _old_count <> 2 OR _new_count <> 0 THEN
      RAISE EXCEPTION 'R5_8_12_ROLLBACK_POSTCONDITION_INVALID: % old=% new=%', _target, _old_count, _new_count USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
    IF (_target = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure AND _md5 <> '72df9c518f5573db232a6759301e4360')
       OR (_target = 'public.assert_verified_parser_provenance(uuid)'::regprocedure AND _md5 <> 'f5e27fc3961d7d4bee50d440862f39cc')
       OR (_target = 'public.enforce_approved_attestation_workflow()'::regprocedure AND _md5 <> 'f95e6a50fd78a5aef78feb4d0dd7fdd1') THEN
      RAISE EXCEPTION 'R5_8_12_ROLLBACK_FUNCTION_HASH_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
    END IF;
  END LOOP;

  COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
    IS 'R5.8.11 re-pinned recorder: Railway deployment ce9b760d-c92f-4da1-a3e6-dd105d49585c, source and build commit eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1, semantic revision git:c2e045b0f71a7699c935b65ffe514fe526889de3, branch main, approved workflow blob 523cee5b0fecc21c7ce2b5f538b42670eec3fed1.';
  COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
    IS 'R5.8.11 re-pinned provenance assertion: Railway deployment ce9b760d-c92f-4da1-a3e6-dd105d49585c, branch main, semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3, build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1, approved workflow blob 523cee5b0fecc21c7ce2b5f538b42670eec3fed1.';
  COMMENT ON FUNCTION public.enforce_approved_attestation_workflow()
    IS 'R5.8.10 re-pinned fail-closed persistence boundary using reviewed workflow Git blob 523cee5b0fecc21c7ce2b5f538b42670eec3fed1.';

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure
        AND p.prosecdef AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_12_ROLLBACK_RECORDER_PROPERTIES_INVALID' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = 'public.assert_verified_parser_provenance(uuid)'::regprocedure
        AND p.prosecdef AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.assert_verified_parser_provenance(uuid)'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.assert_verified_parser_provenance(uuid)'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.assert_verified_parser_provenance(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_12_ROLLBACK_ASSERT_PROPERTIES_INVALID' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = 'public.enforce_approved_attestation_workflow()'::regprocedure
        AND p.prosecdef AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres')
     OR pg_catalog.has_function_privilege('service_role', 'public.enforce_approved_attestation_workflow()'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.enforce_approved_attestation_workflow()'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.enforce_approved_attestation_workflow()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_12_ROLLBACK_BOUNDARY_PROPERTIES_INVALID' USING ERRCODE = '55000';
  END IF;
END;
$r5812_rollback$;
