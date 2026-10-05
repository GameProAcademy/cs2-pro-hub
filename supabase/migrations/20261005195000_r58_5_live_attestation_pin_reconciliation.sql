DO $migration$
DECLARE
  _definition text;
  _function_oid regprocedure;
  _old_deployment_1 constant text := '6330c8c4-a410-45db-a364-4eb47702c2fc';
  _old_deployment_2 constant text := '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a';
  _old_source_commit constant text := '65efee000a23f7e5e42aa08c4279e2c3bf3c52fd';
  _old_workflow_sha constant text := '13ce10e95a508e62d832bb9dc432e1496499676c';
  _new_deployment constant text := '1b5778de-3eaf-46f1-9ea5-cba381d95313';
  _new_source_commit constant text := '91aeee853200d0f461d0d36af1781d7fdfa40941';
  _new_workflow_sha constant text := '3070d8bae6c3f02093bbb2595138c913646c2e31';
BEGIN
  /*
   * R5.8.5 fail-closed live recorder pin reconciliation.
   *
   * Function-specific postconditions:
   *   enforce_approved_attestation_workflow: workflow pin
   *   record_parser_runtime_attestation: deployment + source + workflow pins
   *   assert_verified_parser_provenance: deployment + workflow pins
   *   h3e91_live_database_evidence: deployment + workflow pins
   *
   * No provenance row, nonce, Attempt 9, Canonical authorization, secret,
   * parser data, or Railway resource is modified by this migration.
   */
  FOREACH _function_oid IN ARRAY ARRAY[
    'public.enforce_approved_attestation_workflow()'::regprocedure,
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure,
    'public.h3e91_live_database_evidence()'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

    IF NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid)
       OR NOT (
         SELECT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[]
         FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid
       )
    THEN
      RAISE EXCEPTION 'R5_8_5_FUNCTION_SECURITY_PRECONDITION_INVALID: %', _function_oid
        USING ERRCODE = '55000';
    END IF;

    _definition := pg_catalog.replace(_definition, _old_deployment_1, _new_deployment);
    _definition := pg_catalog.replace(_definition, _old_deployment_2, _new_deployment);
    _definition := pg_catalog.replace(_definition, _old_workflow_sha, _new_workflow_sha);

    IF _function_oid =
       'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure
    THEN
      _definition := pg_catalog.replace(_definition, _old_source_commit, _new_source_commit);
    END IF;

    EXECUTE _definition;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'public.enforce_approved_attestation_workflow()'::regprocedure
  ) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_workflow_sha) <> 0
     OR pg_catalog.strpos(_definition, _new_workflow_sha) = 0
  THEN
    RAISE EXCEPTION 'R5_8_5_WORKFLOW_PIN_RECONCILIATION_FAILED'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure
  ) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_deployment_1) <> 0
     OR pg_catalog.strpos(_definition, _old_deployment_2) <> 0
     OR pg_catalog.strpos(_definition, _new_deployment) = 0
     OR pg_catalog.strpos(_definition, _old_source_commit) <> 0
     OR pg_catalog.strpos(_definition, _new_source_commit) = 0
     OR pg_catalog.strpos(_definition, _old_workflow_sha) <> 0
     OR pg_catalog.strpos(_definition, _new_workflow_sha) = 0
  THEN
    RAISE EXCEPTION 'R5_8_5_RECORDER_PIN_RECONCILIATION_FAILED'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_deployment_1) <> 0
     OR pg_catalog.strpos(_definition, _old_deployment_2) <> 0
     OR pg_catalog.strpos(_definition, _new_deployment) = 0
     OR pg_catalog.strpos(_definition, _old_workflow_sha) <> 0
     OR pg_catalog.strpos(_definition, _new_workflow_sha) = 0
  THEN
    RAISE EXCEPTION 'R5_8_5_PROVENANCE_PIN_RECONCILIATION_FAILED'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.h3e91_live_database_evidence()'::regprocedure
  ) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_deployment_1) <> 0
     OR pg_catalog.strpos(_definition, _old_deployment_2) <> 0
     OR pg_catalog.strpos(_definition, _new_deployment) = 0
     OR pg_catalog.strpos(_definition, _old_workflow_sha) <> 0
     OR pg_catalog.strpos(_definition, _new_workflow_sha) = 0
  THEN
    RAISE EXCEPTION 'R5_8_5_LIVE_EVIDENCE_PIN_RECONCILIATION_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS
  'R5.8.5 reconciled fail-closed persistence boundary using reviewed workflow Git blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'R5.8.5 reconciled recorder: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313, source commit 91aeee853200d0f461d0d36af1781d7fdfa40941, approved workflow blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'R5.8.5 reconciled provenance assertion: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313 and approved workflow blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';

COMMENT ON FUNCTION public.h3e91_live_database_evidence() IS
  'R5.8.5 live database evidence: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313 and approved workflow blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';
