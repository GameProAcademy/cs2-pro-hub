DO $migration$
DECLARE
  _function_oid regprocedure;
  _definition text;
  _old_deployment constant text := '7a540da0-3a69-44c0-9c42-40209f903fa7';
  _new_deployment constant text := '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a';
  _old_workflow_sha constant text := 'fae651ed5174aa609e4b07d575105d80a00d0055';
  _new_workflow_sha constant text := '3070d8bae6c3f02093bbb2595138c913646c2e31';
BEGIN
  IF (SELECT count(*) FROM public.parser_runtime_provenance) <> 0
     OR (SELECT count(*) FROM public.parser_attestation_nonces) <> 0
  THEN
    RAISE EXCEPTION 'R5_8_PIN_RECONCILIATION_REQUIRES_EMPTY_ATTESTATION_STATE'
      USING ERRCODE = '55000';
  END IF;

  FOREACH _function_oid IN ARRAY ARRAY[
    'public.enforce_approved_attestation_workflow()'::regprocedure,
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure,
    'public.h3e91_live_database_evidence()'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

    IF pg_catalog.strpos(_definition, _old_workflow_sha) = 0 THEN
      RAISE EXCEPTION 'R5_8_OLD_WORKFLOW_PIN_NOT_FOUND: %', _function_oid
        USING ERRCODE = '55000';
    END IF;

    IF _function_oid <> 'public.enforce_approved_attestation_workflow()'::regprocedure
       AND pg_catalog.strpos(_definition, _old_deployment) = 0
    THEN
      RAISE EXCEPTION 'R5_8_OLD_DEPLOYMENT_PIN_NOT_FOUND: %', _function_oid
        USING ERRCODE = '55000';
    END IF;

    IF NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid)
       OR NOT (SELECT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid)
    THEN
      RAISE EXCEPTION 'R5_8_FUNCTION_SECURITY_PRECONDITION_INVALID: %', _function_oid
        USING ERRCODE = '55000';
    END IF;

    EXECUTE pg_catalog.replace(
      pg_catalog.replace(_definition, _old_deployment, _new_deployment),
      _old_workflow_sha,
      _new_workflow_sha
    );
  END LOOP;

  FOREACH _function_oid IN ARRAY ARRAY[
    'public.enforce_approved_attestation_workflow()'::regprocedure,
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure,
    'public.h3e91_live_database_evidence()'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

    IF pg_catalog.strpos(_definition, _old_workflow_sha) <> 0
       OR pg_catalog.strpos(_definition, _old_deployment) <> 0
       OR pg_catalog.strpos(_definition, _new_workflow_sha) = 0
       OR NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid)
       OR NOT (SELECT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid)
    THEN
      RAISE EXCEPTION 'R5_8_PIN_RECONCILIATION_POSTCONDITION_FAILED: %', _function_oid
        USING ERRCODE = '55000';
    END IF;

    IF _function_oid <> 'public.enforce_approved_attestation_workflow()'::regprocedure
       AND _function_oid <> 'public.h3e91_live_database_evidence()'::regprocedure
       AND pg_catalog.strpos(_definition, _new_deployment) = 0
    THEN
      RAISE EXCEPTION 'R5_8_DEPLOYMENT_PIN_POSTCONDITION_FAILED: %', _function_oid
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS
  'R5.8 reconciled fail-closed persistence boundary using reviewed workflow Git blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'R5.8 reconciled authoritative recorder for deployment 207d0b66-dc8f-4ebc-96cd-6a2ef999f62a and reviewed workflow Git blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'R5.8 reconciled immutable VERIFIED schema-v3 provenance assertion for deployment 207d0b66-dc8f-4ebc-96cd-6a2ef999f62a and reviewed workflow Git blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';
