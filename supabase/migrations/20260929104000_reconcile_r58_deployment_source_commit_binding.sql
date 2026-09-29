DO $migration$
DECLARE
  _definition text;
  _function_oid regprocedure;
BEGIN
  /*
   * R5.8 identity reconciliation:
   * parser identity, Railway deployment identity/source identity, and
   * approved attestation workflow identity are separate fail-closed pins.
   * No secret is stored or persisted by this migration.
   */

  _function_oid := 'public.enforce_approved_attestation_workflow()'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;
  _definition := pg_catalog.replace(
    _definition,
    '13ce10e95a508e62d832bb9dc432e1496499676c',
    '3070d8bae6c3f02093bbb2595138c913646c2e31'
  );
  EXECUTE _definition;

  _function_oid := 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;
  _definition := pg_catalog.replace(
    _definition,
    '6330c8c4-a410-45db-a364-4eb47702c2fc',
    '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a'
  );
  _definition := pg_catalog.replace(
    _definition,
    '13ce10e95a508e62d832bb9dc432e1496499676c',
    '3070d8bae6c3f02093bbb2595138c913646c2e31'
  );
  _definition := pg_catalog.replace(
    _definition,
    $$OR _payload->'deployment_evidence'->>'source_commit'<>_payload->>'git_commit'$$,
    $$OR _payload->'deployment_evidence'->>'source_commit'<>'65efee000a23f7e5e42aa08c4279e2c3bf3c52fd'$$
  );
  EXECUTE _definition;

  _function_oid := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;
  _definition := pg_catalog.replace(
    _definition,
    '6330c8c4-a410-45db-a364-4eb47702c2fc',
    '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a'
  );
  _definition := pg_catalog.replace(
    _definition,
    '13ce10e95a508e62d832bb9dc432e1496499676c',
    '3070d8bae6c3f02093bbb2595138c913646c2e31'
  );
  EXECUTE _definition;

  SELECT pg_catalog.pg_get_functiondef(
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure
  ) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, '6330c8c4-a410-45db-a364-4eb47702c2fc') <> 0
     OR pg_catalog.strpos(_definition, '13ce10e95a508e62d832bb9dc432e1496499676c') <> 0
     OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a') = 0
     OR pg_catalog.strpos(_definition, '3070d8bae6c3f02093bbb2595138c913646c2e31') = 0
     OR pg_catalog.strpos(_definition, '65efee000a23f7e5e42aa08c4279e2c3bf3c52fd') = 0
  THEN
    RAISE EXCEPTION 'R5_8_RECORDER_IDENTITY_RECONCILIATION_FAILED'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, '6330c8c4-a410-45db-a364-4eb47702c2fc') <> 0
     OR pg_catalog.strpos(_definition, '13ce10e95a508e62d832bb9dc432e1496499676c') <> 0
     OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a') = 0
     OR pg_catalog.strpos(_definition, '3070d8bae6c3f02093bbb2595138c913646c2e31') = 0
  THEN
    RAISE EXCEPTION 'R5_8_PROVENANCE_ASSERTION_RECONCILIATION_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'R5.8 reconciled recorder: parser identity, Railway deployment identity/source identity, and approved workflow blob are distinct and fail-closed.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'R5.8 reconciled provenance assertion: active Railway deployment and approved attestation workflow pins are enforced.';
