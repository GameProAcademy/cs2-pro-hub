-- R5.8.15: re-pin the runtime identity after the D13b parser release, without rewriting prior migrations.
--
-- PR #162 (merge a5d8c425839e1e0e7e6f5506ae141bc85359726b) changed services/cs2-demo-parser/parser.py
-- (observed round starts segmented by observed round ends). The worker was released under a
-- watch-pattern freeze as ONE controlled Railway deployment of that exact commit (after Railway
-- incident JUA1PC5H paused builds): deployment 01998834-4c35-43c2-b3e4-976f76a21fd5, semantic = build = a5d8c425...
-- The parser.py critical blob changed 8f75eb61... -> 024c1dd4...; adapter/worker/raw_evidence/settings
-- blobs and the approved workflow blob are unchanged (docs/reference/r5_8_15/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.14 targets (or is a no-op at the R5.8.15 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5815$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['19a352c2be59dca326d5905c9dacb251', 'df0dc1b394d38a1f58f2a27afe0ea0cf'];
  _target_md5 constant text[] := ARRAY['d9328086d1541927c4bf3b508c8c307b', '39418665644987bcdd25c7456634d410'];
  _old_deployment constant text := '3acb47c5-d9a4-43f2-acff-9ead7cb12b30';
  _new_deployment constant text := '01998834-4c35-43c2-b3e4-976f76a21fd5';
  _old_commit constant text := '7f70141b7c3ae231fbbca4c37058c4cdbdd7aacd';
  _new_commit constant text := 'a5d8c425839e1e0e7e6f5506ae141bc85359726b';
  _old_parser_blob constant text := '8f75eb61f82f6746881b361234a6f5e3a59a4225';
  _new_parser_blob constant text := '024c1dd48abfdd5f7d34881860b8dbd2a87a3b8a';
  -- Expected occurrences per function: deployment, commit (semantic = build), parser.py blob.
  _deployment_count constant integer[] := ARRAY[1, 1];
  _commit_count constant integer[] := ARRAY[4, 3];
  _parser_blob_count constant integer[] := ARRAY[1, 0];
  _i integer;
  _target regprocedure;
  _definition text;
  _md5 text;
  _before_properties jsonb;
  _after_properties jsonb;
BEGIN
  -- The workflow boundary carries none of these pins and must still be at its R5.8.12 target.
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.enforce_approved_attestation_workflow()'::regprocedure;
  IF _md5 IS DISTINCT FROM 'f74d8af991b7ec6f33d9aabbef00c4fc' THEN
    RAISE EXCEPTION 'R5_8_15_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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

    IF _md5 = _target_md5[_i]
       AND pg_catalog.strpos(_definition, _old_deployment) = 0
       AND pg_catalog.strpos(_definition, _old_commit) = 0
       AND pg_catalog.strpos(_definition, _old_parser_blob) = 0 THEN
      RAISE NOTICE 'R5_8_15_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_deployment, ''))) / pg_catalog.length(_old_deployment) = _deployment_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_commit, ''))) / pg_catalog.length(_old_commit) = _commit_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_parser_blob, ''))) / pg_catalog.length(_old_parser_blob) = _parser_blob_count[_i]
       AND pg_catalog.strpos(_definition, _new_deployment) = 0
       AND pg_catalog.strpos(_definition, _new_commit) = 0
       AND pg_catalog.strpos(_definition, _new_parser_blob) = 0 THEN
      _definition := pg_catalog.replace(_definition, _old_deployment, _new_deployment);
      _definition := pg_catalog.replace(_definition, _old_commit, _new_commit);
      _definition := pg_catalog.replace(_definition, _old_parser_blob, _new_parser_blob);
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_commit, ''))) / pg_catalog.length(_new_commit) <> _commit_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_deployment, ''))) / pg_catalog.length(_new_deployment) <> _deployment_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_parser_blob, ''))) / pg_catalog.length(_new_parser_blob) <> _parser_blob_count[_i] THEN
        RAISE EXCEPTION 'R5_8_15_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_15_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_15_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_15_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5815$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.15 re-pinned recorder: Railway deployment 01998834-4c35-43c2-b3e4-976f76a21fd5 (controlled release of a5d8c425), semantic git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, build git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, parser.py blob 024c1dd48abfdd5f7d34881860b8dbd2a87a3b8a, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.15 re-pinned provenance assertion: Railway deployment 01998834-4c35-43c2-b3e4-976f76a21fd5, semantic git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, build git:a5d8c425839e1e0e7e6f5506ae141bc85359726b, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
