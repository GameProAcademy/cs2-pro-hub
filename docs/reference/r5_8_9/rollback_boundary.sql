-- Rollback of R5.8.9b (generated). Restores the managed definitions and comments of 2026-10-13;
-- fails closed from any other state. Reads or writes no row: allowed on the managed database.

DO $r589b$
DECLARE
  _fn constant regprocedure := 'public.assert_verified_parser_provenance(uuid)'::regprocedure;
  _md5 text;
  _def text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_9B_PROPERTIES_INVALID (assert_verified_parser_provenance, before)' USING ERRCODE = '55000';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_9B_GRANTS_INVALID (assert_verified_parser_provenance, before)' USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 = 'e00209501284eed35cb6fb710bca4390' THEN
    RAISE NOTICE 'R5_8_9B_ALREADY_IN_TARGET_STATE (assert_verified_parser_provenance)';
  ELSIF _md5 = 'b1576ce0d085e7bc1961d37b34a432f2' THEN
    _def := pg_catalog.pg_get_functiondef(_fn);
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.railway_branch<>''main''', '')))
         <> pg_catalog.length('_p.railway_branch<>''main''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.railway_branch<>''main''', '_p.railway_branch<>''infra/cs2-parser-worker-v8''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.deployment_id<>''09b50029-2508-4267-bb1d-28c5e99b95db''', '')))
         <> pg_catalog.length('_p.deployment_id<>''09b50029-2508-4267-bb1d-28c5e99b95db''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.deployment_id<>''09b50029-2508-4267-bb1d-28c5e99b95db''', '_p.deployment_id<>''1b5778de-3eaf-46f1-9ea5-cba381d95313''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.deployment_commit<>''10815fb44e165963adfaf07f71c474ca628f4b7f''', '')))
         <> pg_catalog.length('_p.deployment_commit<>''10815fb44e165963adfaf07f71c474ca628f4b7f''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.deployment_commit<>''10815fb44e165963adfaf07f71c474ca628f4b7f''', '_p.deployment_commit<>''5703b1d88f21ee57fdd1d83722edf30e0f0c6f76''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.semantic_revision<>''git:10815fb44e165963adfaf07f71c474ca628f4b7f''', '')))
         <> pg_catalog.length('_p.semantic_revision<>''git:10815fb44e165963adfaf07f71c474ca628f4b7f''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.semantic_revision<>''git:10815fb44e165963adfaf07f71c474ca628f4b7f''', '_p.semantic_revision<>''git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.build_revision<>''git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''', '')))
         <> pg_catalog.length('_p.build_revision<>''git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.build_revision<>''git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d''', '_p.build_revision<>''git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '_p.workflow_identity->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '')))
         <> pg_catalog.length('_p.workflow_identity->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '_p.workflow_identity->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '_p.workflow_identity->>''workflow_source_sha''<>''3070d8bae6c3f02093bbb2595138c913646c2e31''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '')))
         <> pg_catalog.length('''attestor_source_identity''->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (assert_verified_parser_provenance)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha''<>''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '''attestor_source_identity''->>''workflow_source_sha''<>''3070d8bae6c3f02093bbb2595138c913646c2e31''');
    EXECUTE _def;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
    IF _md5 IS DISTINCT FROM 'e00209501284eed35cb6fb710bca4390' THEN
      RAISE EXCEPTION 'R5_8_9B_POSTCONDITION_INVALID (assert_verified_parser_provenance): %', _md5 USING ERRCODE = '55000';
    END IF;
      COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid) IS 'R5.8.5 reconciled provenance assertion: current Railway deployment 1b5778de-3eaf-46f1-9ea5-cba381d95313 and approved workflow blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';
  ELSE
    RAISE EXCEPTION 'R5_8_9B_UNEXPECTED_DEFINITION (assert_verified_parser_provenance): %', _md5 USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_9B_PROPERTIES_INVALID (assert_verified_parser_provenance, after)' USING ERRCODE = '55000';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_9B_GRANTS_INVALID (assert_verified_parser_provenance, after)' USING ERRCODE = '55000';
  END IF;
END;
$r589b$;

DO $r589b$
DECLARE
  _fn constant regprocedure := 'public.enforce_approved_attestation_workflow()'::regprocedure;
  _md5 text;
  _def text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_9B_PROPERTIES_INVALID (enforce_approved_attestation_workflow, before)' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_9B_GRANTS_INVALID (enforce_approved_attestation_workflow, before)' USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
  IF _md5 = '8a10c243e91f8f0a6db41279cf643830' THEN
    RAISE NOTICE 'R5_8_9B_ALREADY_IN_TARGET_STATE (enforce_approved_attestation_workflow)';
  ELSIF _md5 = 'b9412b87a12d51a4fa0e68bafd23735a' THEN
    _def := pg_catalog.pg_get_functiondef(_fn);
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, 'NEW.workflow_identity->>''workflow_source_sha'' <> ''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '')))
         <> pg_catalog.length('NEW.workflow_identity->>''workflow_source_sha'' <> ''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (enforce_approved_attestation_workflow)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, 'NEW.workflow_identity->>''workflow_source_sha'' <> ''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', 'NEW.workflow_identity->>''workflow_source_sha'' <> ''3070d8bae6c3f02093bbb2595138c913646c2e31''');
      IF (pg_catalog.length(_def) - pg_catalog.length(pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha'' <> ''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '')))
         <> pg_catalog.length('''attestor_source_identity''->>''workflow_source_sha'' <> ''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''') THEN
        RAISE EXCEPTION 'R5_8_9B_FRAGMENT_COUNT_INVALID (enforce_approved_attestation_workflow)' USING ERRCODE = '55000';
      END IF;
      _def := pg_catalog.replace(_def, '''attestor_source_identity''->>''workflow_source_sha'' <> ''80c6cb645b81ba427ad3d97ee8feb1964ba62d87''', '''attestor_source_identity''->>''workflow_source_sha'' <> ''3070d8bae6c3f02093bbb2595138c913646c2e31''');
    EXECUTE _def;
    SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _fn;
    IF _md5 IS DISTINCT FROM '8a10c243e91f8f0a6db41279cf643830' THEN
      RAISE EXCEPTION 'R5_8_9B_POSTCONDITION_INVALID (enforce_approved_attestation_workflow): %', _md5 USING ERRCODE = '55000';
    END IF;
      COMMENT ON FUNCTION public.enforce_approved_attestation_workflow() IS 'R5.8.5 reconciled fail-closed persistence boundary using reviewed workflow Git blob 3070d8bae6c3f02093bbb2595138c913646c2e31.';
  ELSE
    RAISE EXCEPTION 'R5_8_9B_UNEXPECTED_DEFINITION (enforce_approved_attestation_workflow): %', _md5 USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = _fn AND p.prosecdef
        AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres') THEN
    RAISE EXCEPTION 'R5_8_9B_PROPERTIES_INVALID (enforce_approved_attestation_workflow, after)' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.has_function_privilege('service_role', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', _fn, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', _fn, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid = _fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'R5_8_9B_GRANTS_INVALID (enforce_approved_attestation_workflow, after)' USING ERRCODE = '55000';
  END IF;
END;
$r589b$;
