-- Rollback of R5.8.11b (generated). Restores the R5.8.10b target definitions and comments;
-- fails closed from any other state. Reads or writes no row: allowed on the managed database.

DO $r5811b$
DECLARE
  _fn constant regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _md5 text;
  _def text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_11B_PROPERTIES_INVALID (assert_verified_parser_provenance, before)' USING ERRCODE = '55000';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_11B_GRANTS_INVALID (assert_verified_parser_provenance, before)' USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 = '57e4196115eb9253fd307e4443fb603c' THEN
    RAISE NOTICE 'R5_8_11B_ALREADY_IN_TARGET_STATE (assert_verified_parser_provenance)';
  ELSIF _md5 = '5b3953911fc6fe3c5cbf31da75425942' THEN
    _def := pg_catalog.pg_get_functiondef(_fn);
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.railway_branch<>''main''', '')))
         <> pg_catalog.length('_p.railway_branch<>''main''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.railway_branch<>''main''', '_p.railway_branch<>''main''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.deployment_id<>''ce9b760d-c92f-4da1-a3e6-dd105d49585c''', '')))
         <> pg_catalog.length('_p.deployment_id<>''ce9b760d-c92f-4da1-a3e6-dd105d49585c''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.deployment_id<>''ce9b760d-c92f-4da1-a3e6-dd105d49585c''', '_p.deployment_id<>''25df86c3-22e1-4986-9b91-cdabe54535c5''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.deployment_commit<>''eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''', '')))
         <> pg_catalog.length('_p.deployment_commit<>''eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.deployment_commit<>''eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''', '_p.deployment_commit<>''60099ed3eaf959d888762bf55043255a63a6a766''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.semantic_revision<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''', '')))
         <> pg_catalog.length('_p.semantic_revision<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.semantic_revision<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''', '_p.semantic_revision<>''git:60099ed3eaf959d888762bf55043255a63a6a766''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.build_revision<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''', '')))
         <> pg_catalog.length('_p.build_revision<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.build_revision<>''git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1''', '_p.build_revision<>''git:60099ed3eaf959d888762bf55043255a63a6a766''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.workflow_identity->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '')))
         <> pg_catalog.length('_p.workflow_identity->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.workflow_identity->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '_p.workflow_identity->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '')))
         <> pg_catalog.length('''attestor_source_identity''->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '''attestor_source_identity''->>''workflow_source_sha''<>''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''');
    EXECUTE _def;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
    IF _md5 IS DISTINCT FROM '57e4196115eb9253fd307e4443fb603c' THEN
      RAISE EXCEPTION 'R5_8_11B_POSTCONDITION_INVALID (assert_verified_parser_provenance): %', _md5 USING ERRCODE = '55000';
    END IF;
    COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS 'R5.8.10 re-pinned provenance assertion: Railway deployment 25df86c3-22e1-4986-9b91-cdabe54535c5, branch main, semantic git:60099ed3eaf959d888762bf55043255a63a6a766, build git:60099ed3eaf959d888762bf55043255a63a6a766, approved workflow blob 523cee5b0fecc21c7ce2b5f538b42670eec3fed1.';
  ELSE
    RAISE EXCEPTION 'R5_8_11B_UNEXPECTED_DEFINITION (assert_verified_parser_provenance): %', _md5 USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_11B_PROPERTIES_INVALID (assert_verified_parser_provenance, after)' USING ERRCODE = '55000';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_11B_GRANTS_INVALID (assert_verified_parser_provenance, after)' USING ERRCODE = '55000';
  END IF;
END;
$r5811b$;

DO $r5811b$
DECLARE
  _fn constant regprocedure := 'public.enforce_approved_attestation_workflow()'::regprocedure;
  _md5 text;
  _def text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_11B_PROPERTIES_INVALID (enforce_approved_attestation_workflow, before)' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_11B_GRANTS_INVALID (enforce_approved_attestation_workflow, before)' USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 = 'f95e6a50fd78a5aef78feb4d0dd7fdd1' THEN
    RAISE NOTICE 'R5_8_11B_ALREADY_IN_TARGET_STATE (enforce_approved_attestation_workflow)';
  ELSIF _md5 = 'f95e6a50fd78a5aef78feb4d0dd7fdd1' THEN
    _def := pg_catalog.pg_get_functiondef(_fn);
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, 'NEW.workflow_identity->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '')))
         <> pg_catalog.length('NEW.workflow_identity->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (enforce_approved_attestation_workflow)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, 'NEW.workflow_identity->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', 'NEW.workflow_identity->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '')))
         <> pg_catalog.length('''attestor_source_identity''->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''') THEN
        RAISE EXCEPTION 'R5_8_11B_FRAGMENT_COUNT_INVALID (enforce_approved_attestation_workflow)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''', '''attestor_source_identity''->>''workflow_source_sha'' <> ''523cee5b0fecc21c7ce2b5f538b42670eec3fed1''');
    EXECUTE _def;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
    IF _md5 IS DISTINCT FROM 'f95e6a50fd78a5aef78feb4d0dd7fdd1' THEN
      RAISE EXCEPTION 'R5_8_11B_POSTCONDITION_INVALID (enforce_approved_attestation_workflow): %', _md5 USING ERRCODE = '55000';
    END IF;
    COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS 'R5.8.10 re-pinned fail-closed persistence boundary using reviewed workflow Git blob 523cee5b0fecc21c7ce2b5f538b42670eec3fed1.';
  ELSE
    RAISE EXCEPTION 'R5_8_11B_UNEXPECTED_DEFINITION (enforce_approved_attestation_workflow): %', _md5 USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_11B_PROPERTIES_INVALID (enforce_approved_attestation_workflow, after)' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_11B_GRANTS_INVALID (enforce_approved_attestation_workflow, after)' USING ERRCODE = '55000';
  END IF;
END;
$r5811b$;
