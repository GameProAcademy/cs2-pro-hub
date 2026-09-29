DO $migration$
DECLARE
  _definition text;
  _function_oid regprocedure;
BEGIN
  /*
   * R5.8.1 recorder pin repair.
   *
   * The previous reconciliation migration used a whitespace-sensitive
   * replacement for the Railway source-commit predicate. PostgreSQL's
   * pg_get_functiondef() normalizes formatting, so that replacement could
   * miss the live predicate and fail closed.
   *
   * This migration is intentionally idempotent and uses regexp_replace for
   * the source-commit binding. It does not store or persist any secret.
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

  _definition := pg_catalog.regexp_replace(
    _definition,
    $$OR[[:space:]]+_payload->'deployment_evidence'->>'source_commit'[[:space:]]*<>[[:space:]]*_payload->>'git_commit'$$,
    $$OR _payload->'deployment_evidence'->>'source_commit' <> '65efee000a23f7e5e42aa08c4279e2c3bf3c52fd'$$,
    'g'
  );

  EXECUTE _definition;

  _function_oid := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

  _definition := pg_catalog.replace(
    _definition,
    '6330c8c4-a410-45db-a364-4eb47702c2fc',
    '207d0b66-dc8f-4ad4-bef9-6f8d20856bea'
  );

  /*
   * The provenance assertion has historically used the same deployment pin.
   * Reconcile both the known stale pin and the active pin without assuming
   * which prior repair migration actually reached the database.
   */
  _definition := pg_catalog.replace(
    _definition,
    '207d0b66-dc8f-4ad4-bef9-6f8d20856bea',
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
     OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ad4-bef9-6f8d20856bea') <> 0
     OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a') = 0
     OR pg_catalog.strpos(_definition, '3070d8bae6c3f02093bbb2595138c913646c2e31') = 0
     OR pg_catalog.strpos(_definition, '65efee000a23f7e5e42aa08c4279e2c3bf3c52fd') = 0
     OR pg_catalog.strpos(_definition, $$OR _payload->'deployment_evidence'->>'source_commit' <> _payload->>'git_commit'$$) <> 0
  THEN
    RAISE EXCEPTION 'R5_8_1_RECORDER_PIN_REPAIR_FAILED'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, '6330c8c4-a410-45db-a364-4eb47702c2fc') <> 0
     OR pg_catalog.strpos(_definition, '13ce10e95a508e62d832bb9dc432e1496499676c') <> 0
     OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ad4-bef9-6f8d20856bea') <> 0
     OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a') = 0
     OR pg_catalog.strpos(_definition, '3070d8bae6c3f02093bbb2595138c913646c2e31') = 0
  THEN
    RAISE EXCEPTION 'R5_8_1_PROVENANCE_PIN_REPAIR_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'R5.8.1 reconciled recorder: parser identity, Railway deployment identity/source identity, and approved workflow blob are distinct and fail-closed.';

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'R5.8.1 reconciled provenance assertion: active Railway deployment and approved attestation workflow pins are enforced.';
