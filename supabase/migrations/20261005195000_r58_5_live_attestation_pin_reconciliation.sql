DO $migration$
DECLARE
  _definition text;
  _function_oid regprocedure;
  _old_deployments constant text[] := ARRAY[
    '6330c8c4-a410-45db-a364-4eb47702c2fc',
    '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a'
  ];
  _old_source constant text := '65efee000a23f7e5e42aa08c4279e2c3bf3c52fd';
  _old_workflow constant text := '13ce10e95a508e62d832bb9dc432e1496499676c';
  _new_deployment constant text := '1b5778de-3eaf-46f1-9ea5-cba381d95313';
  _new_source constant text := '91aeee853200d0f461d0d36af1781d7fdfa40941';
  _new_workflow constant text := '3070d8bae6c3f02093bbb2595138c913646c2e31';
BEGIN
  /*
   * R5.8.5 fail-closed live recorder pin reconciliation.
   *
   * This migration does not touch provenance rows, Attempt 9, Canonical
   * authorization, secrets, or parser data. It only repairs known stale
   * identity literals in the server-side attestation functions so the live
   * recorder accepts evidence for the currently approved Railway deployment
   * and reviewed GitHub workflow source.
   */
  FOREACH _function_oid IN ARRAY ARRAY[
    'public.enforce_approved_attestation_workflow()'::regprocedure,
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure,
    'public.h3e91_live_database_evidence()'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

    FOREACH _old_source IN ARRAY _old_source LOOP
      _definition := pg_catalog.replace(_definition, _old_source, _new_source);
    END LOOP;

    FOREACH _old_source IN ARRAY _old_workflow LOOP
      _definition := pg_catalog.replace(_definition, _old_source, _new_workflow);
    END LOOP;

    FOREACH _old_source IN ARRAY _old_deployments LOOP
      _definition := pg_catalog.replace(_definition, _old_source, _new_deployment);
    END LOOP;

    EXECUTE _definition;
  END LOOP;

  FOREACH _function_oid IN ARRAY ARRAY[
    'public.enforce_approved_attestation_workflow()'::regprocedure,
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure,
    'public.h3e91_live_database_evidence()'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

    IF pg_catalog.strpos(_definition, _new_deployment) = 0
       OR pg_catalog.strpos(_definition, _new_workflow) = 0
       OR pg_catalog.strpos(_definition, '6330c8c4-a410-45db-a364-4eb47702c2fc') <> 0
       OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a') <> 0
       OR pg_catalog.strpos(_definition, _old_source) <> 0
       OR pg_catalog.strpos(_definition, _old_workflow) <> 0
    THEN
      RAISE EXCEPTION 'R5_8_5_LIVE_ATTESTATION_PIN_RECONCILIATION_FAILED'
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS
  'R5.8.5 reconciled: reviewed workflow blob 3070d8bae6c3f02093bbb2595138c913646c2e31 is the only approved attestation workflow source.';

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'R5.8.5 reconciled: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313, source commit 91aeee853200d0f461d0d36af1781d7fdfa40941, approved workflow blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'R5.8.5 reconciled provenance assertion: current Railway deployment and approved workflow pins are enforced.';

COMMENT ON FUNCTION public.h3e91_live_database_evidence() IS
  'R5.8.5 live evidence: current Railway deployment and approved workflow pins are enforced.';
