DO $migration$
DECLARE
  _function_oid regprocedure := 'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure;
  _definition text;
  _old_clause constant text := $$OR _payload->'deployment_evidence'->>'source_commit'<>_payload->>'git_commit'$$;
  _new_clause constant text := $$OR _payload->'deployment_evidence'->>'source_commit'<>'65efee000a23f7e5e42aa08c4279e2c3bf3c52fd'$$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_clause) = 0 THEN
    RAISE EXCEPTION 'R5_8_DEPLOYMENT_SOURCE_COMMIT_BINDING_NOT_FOUND'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.strpos(_definition, '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a') = 0
     OR pg_catalog.strpos(_definition, '3070d8bae6c3f02093bbb2595138c913646c2e31') = 0
     OR NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid)
     OR NOT (SELECT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc p WHERE p.oid = _function_oid)
  THEN
    RAISE EXCEPTION 'R5_8_RECORDER_PIN_PRECONDITION_INVALID'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE pg_catalog.replace(_definition, _old_clause, _new_clause);

  SELECT pg_catalog.pg_get_functiondef(_function_oid) INTO STRICT _definition;

  IF pg_catalog.strpos(_definition, _old_clause) <> 0
     OR pg_catalog.strpos(_definition, _new_clause) = 0
     OR pg_catalog.strpos(_definition, '207d0b66-dc8f-4ebc-96cd-6a2ef999f62a') = 0
     OR pg_catalog.strpos(_definition, '3070d8bae6c3f02093bbb2595138c913646c2e31') = 0
  THEN
    RAISE EXCEPTION 'R5_8_DEPLOYMENT_SOURCE_COMMIT_BINDING_POSTCONDITION_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text) IS
  'R5.8 reconciled recorder: parser git commit and Railway deployment source commit are distinct identities; deployment_evidence.source_commit is bound to the independently verified Railway deployment source commit.';
