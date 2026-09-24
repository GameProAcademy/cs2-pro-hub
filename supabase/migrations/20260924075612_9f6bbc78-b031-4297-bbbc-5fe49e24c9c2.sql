DO $migration$
DECLARE
  _function_oid regprocedure;
  _definition text;
  _old_sha constant text := '13ce10e95a508e62d832bb9dc432e1496499676c';
  _new_sha constant text := 'de6732f465cae08c96aece304558273242b7016d';
BEGIN
  FOREACH _function_oid IN ARRAY ARRAY[
    'public.enforce_approved_attestation_workflow()'::regprocedure,
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;
    IF pg_catalog.strpos(_definition, _old_sha) = 0 THEN
      RAISE EXCEPTION 'ATTESTATION_WORKFLOW_ALLOWLIST_SOURCE_NOT_FOUND: %', _function_oid
        USING ERRCODE = '55000';
    END IF;
    EXECUTE pg_catalog.replace(_definition, _old_sha, _new_sha);
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS
  'H.3-E.2 fail-closed persistence boundary using reviewed workflow Git blob de6732f465cae08c96aece304558273242b7016d.';
COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'H.3-E.2 authoritative recorder for canonical HMAC SHA-256 schema-v3 attestations using reviewed workflow Git blob de6732f465cae08c96aece304558273242b7016d. No v1/v2 fallback.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS
  'H.3-E.2 immutable VERIFIED schema-v3 provenance assertion using reviewed workflow Git blob de6732f465cae08c96aece304558273242b7016d.';