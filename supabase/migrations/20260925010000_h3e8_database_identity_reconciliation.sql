-- H.3-E.8.1 — Database persistence identity reconciliation
--
-- Purpose:
--   Align the protected PostgreSQL attestation recorder with the already
--   verified Railway deployment and the currently reviewed GitHub attestor
--   workflow source. This migration is intentionally fail-closed: it refuses
--   to run if the database is not in the exact pre-reconciliation state.
--
-- Safety:
--   * No provenance row is created.
--   * No nonce is created.
--   * No DEM is executed.
--   * No secrets are read or rotated.
--   * No Railway resource is mutated.
--   * SECURITY DEFINER/search_path/ACL/RLS behavior is preserved.
--   * Only pinned deployment/workflow identity literals are reconciled.

DO $migration$
DECLARE
  _function_oid regprocedure;
  _definition text;
  _old_deployment constant text := '6330c8c4-a410-45db-a364-4eb47702c2fc';
  _new_deployment constant text := '7a540da0-3a69-44c0-9c42-40209f903fa7';
  _old_workflow_sha constant text := 'de6732f465cae08c96aece304558273242b7016d';
  _new_workflow_sha constant text := 'fae651ed5174aa609e4b07d575105d80a00d0055';
  _deployment_function regprocedure := 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  _assert_function regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _workflow_function regprocedure := 'public.enforce_approved_attestation_workflow()'::regprocedure;
BEGIN
  IF EXISTS (SELECT 1 FROM public.parser_runtime_provenance)
     OR EXISTS (SELECT 1 FROM public.parser_attestation_nonces) THEN
    RAISE EXCEPTION
      'H3E8_DB_RECONCILIATION_REFUSED_NONEMPTY_STATE'
      USING ERRCODE = '55000';
  END IF;

  FOREACH _function_oid IN ARRAY ARRAY[
    _deployment_function,
    _assert_function
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid)
      INTO STRICT _definition;

    IF pg_catalog.strpos(_definition, _old_deployment) = 0 THEN
      RAISE EXCEPTION
        'H3E8_DB_RECONCILIATION_EXPECTED_OLD_DEPLOYMENT_NOT_FOUND: %',
        _function_oid
        USING ERRCODE = '55000';
    END IF;

    IF pg_catalog.strpos(_definition, _old_workflow_sha) = 0 THEN
      RAISE EXCEPTION
        'H3E8_DB_RECONCILIATION_EXPECTED_OLD_WORKFLOW_SHA_NOT_FOUND: %',
        _function_oid
        USING ERRCODE = '55000';
    END IF;

    _definition := pg_catalog.replace(
      _definition,
      _old_deployment,
      _new_deployment
    );

    _definition := pg_catalog.replace(
      _definition,
      _old_workflow_sha,
      _new_workflow_sha
    );

    EXECUTE _definition;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(_workflow_function)
    INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_workflow_sha) = 0 THEN
    RAISE EXCEPTION
      'H3E8_DB_RECONCILIATION_EXPECTED_OLD_WORKFLOW_SHA_NOT_FOUND: %',
      _workflow_function
      USING ERRCODE = '55000';
  END IF;

  _definition := pg_catalog.replace(
    _definition,
    _old_workflow_sha,
    _new_workflow_sha
  );

  EXECUTE _definition;

  -- Fail closed if any stale identity remains in the three authoritative
  -- persistence-boundary functions.
  FOREACH _function_oid IN ARRAY ARRAY[
    _workflow_function,
    _deployment_function,
    _assert_function
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid)
      INTO STRICT _definition;

    IF pg_catalog.strpos(_definition, _old_workflow_sha) <> 0
       OR pg_catalog.strpos(_definition, _old_deployment) <> 0 THEN
      RAISE EXCEPTION
        'H3E8_DB_RECONCILIATION_STALE_IDENTITY_REMAINS: %',
        _function_oid
        USING ERRCODE = '55000';
    END IF;

    IF pg_catalog.strpos(_definition, _new_workflow_sha) = 0 THEN
      RAISE EXCEPTION
        'H3E8_DB_RECONCILIATION_NEW_WORKFLOW_SHA_NOT_BOUND: %',
        _function_oid
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS
  'H.3-E.2/H.3-E.8.1 fail-closed persistence boundary using reviewed workflow Git blob fae651ed5174aa609e4b07d575105d80a00d0055.';

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'H.3-E.2/H.3-E.8.1 authoritative recorder for canonical HMAC SHA-256 schema-v3 attestations using reviewed workflow Git blob fae651ed5174aa609e4b07d575105d80a00d0055 and Railway deployment 7a540da0-3a69-44c0-9c42-40209f903fa7.';

COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'H.3-E.2/H.3-E.8.1 immutable VERIFIED schema-v3 provenance assertion using reviewed workflow Git blob fae651ed5174aa609e4b07d575105d80a00d0055 and Railway deployment 7a540da0-3a69-44c0-9c42-40209f903fa7.';
