-- R5.8.13: re-pin the Railway deployment identity without rewriting prior migrations.
--
-- On 2026-10-18 the worker declared its semantic revision as its build revision
-- (PARSER_BUILD_REVISION=git:c2e045b0..., image BUILD_INFO commit eaaa2c8d...,
-- /version declared_revision_matches=false). The variable was corrected and the
-- SAME image source (commit eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1) was
-- redeployed as deployment ece1c582-5cba-403d-b25c-a60faaf1aed5; both /version
-- hosts then reported declared_revision_matches=true. Only the deployment ID
-- changed: semantic and build commits, critical hashes and the approved workflow
-- blob are unchanged (docs/reference/r5_8_13/spec.json).
--
-- This migration replaces the single deployment-ID pin in the recorder and in the
-- provenance assertion. It starts only from the R5.8.12 targets (or is a no-op at
-- the R5.8.13 targets), checks exact occurrence counts and md5(prosrc) before and
-- after, preserves every function property, and touches no row, grant, trigger
-- or index. Any other state fails closed.
BEGIN;

DO $r5813$
DECLARE
  _old constant text := 'ce9b760d-c92f-4da1-a3e6-dd105d49585c';
  _new constant text := 'ece1c582-5cba-403d-b25c-a60faaf1aed5';
  _expected_count constant integer := 1;
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['321d649a3defcf3daf61de8b5f6d6ad2', 'e62a11f966063440eaacb636c608c33a'];
  _target_md5 constant text[] := ARRAY['d4df57084c1b0b90aef266b5b52452c5', 'f070c124846814420c72c34471c84624'];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
  _old_count integer;
  _new_count integer;
  _before_properties jsonb;
  _after_properties jsonb;
BEGIN
  -- The workflow boundary must already be at its R5.8.12 target (it carries no deployment pin).
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.enforce_approved_attestation_workflow()'::regprocedure;
  IF _md5 IS DISTINCT FROM 'f74d8af991b7ec6f33d9aabbef00c4fc' THEN
    RAISE EXCEPTION 'R5_8_13_R5_8_12_STATE_MISSING: enforce_approved_attestation_workflow md5=%', _md5
      USING ERRCODE = '55000';
  END IF;

  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
      'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
      'acl', p.proacl::text, 'kind', p.prokind, 'language', l.lanname,
      'return_type', pg_catalog.pg_get_function_result(p.oid), 'arg_types', p.proargtypes::text,
      'all_arg_types', p.proallargtypes::text, 'arg_modes', p.proargmodes::text,
      'arg_names', p.proargnames::text, 'variadic', p.provariadic,
      'parallel', p.proparallel, 'leakproof', p.proleakproof, 'cost', p.procost,
      'rows', p.prorows, 'support', p.prosupport), pg_catalog.md5(p.prosrc)
      INTO STRICT _before_properties, _md5
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE p.oid = _target;
    _definition := pg_catalog.pg_get_functiondef(_target);
    _old_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old, ''))) / pg_catalog.length(_old);
    _new_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new, ''))) / pg_catalog.length(_new);

    IF _md5 = _target_md5[_i] AND _old_count = 0 AND _new_count = _expected_count THEN
      RAISE NOTICE 'R5_8_13_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i] AND _old_count = _expected_count AND _new_count = 0 THEN
      EXECUTE pg_catalog.replace(_definition, _old, _new);
      _definition := pg_catalog.pg_get_functiondef(_target);
      _old_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old, ''))) / pg_catalog.length(_old);
      _new_count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new, ''))) / pg_catalog.length(_new);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _old_count <> 0 OR _new_count <> _expected_count OR _md5 IS DISTINCT FROM _target_md5[_i] THEN
        RAISE EXCEPTION 'R5_8_13_POSTCONDITION_INVALID: % old=% new=% md5=%', _target, _old_count, _new_count, _md5
          USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_13_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_13_UNEXPECTED_DEPLOYMENT_PIN_STATE: % md5=% old=% new=%', _target, _md5, _old_count, _new_count
        USING ERRCODE = '55000';
    END IF;

    SELECT pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
      'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
      'acl', p.proacl::text, 'kind', p.prokind, 'language', l.lanname,
      'return_type', pg_catalog.pg_get_function_result(p.oid), 'arg_types', p.proargtypes::text,
      'all_arg_types', p.proallargtypes::text, 'arg_modes', p.proargmodes::text,
      'arg_names', p.proargnames::text, 'variadic', p.provariadic,
      'parallel', p.proparallel, 'leakproof', p.proleakproof, 'cost', p.procost,
      'rows', p.prorows, 'support', p.prosupport)
      INTO STRICT _after_properties
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE p.oid = _target;
    IF _before_properties IS DISTINCT FROM _after_properties THEN
      RAISE EXCEPTION 'R5_8_13_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5813$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.13 re-pinned recorder: Railway deployment ece1c582-5cba-403d-b25c-a60faaf1aed5 (redeploy of the eaaa2c8d image), semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3, build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.13 re-pinned provenance assertion: Railway deployment ece1c582-5cba-403d-b25c-a60faaf1aed5, semantic git:c2e045b0f71a7699c935b65ffe514fe526889de3, build git:eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
