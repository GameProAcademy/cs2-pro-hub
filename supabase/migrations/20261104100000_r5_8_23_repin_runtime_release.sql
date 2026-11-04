-- R5.8.23: re-pin the runtime identity after the parser field-governance review, without rewriting prior migrations.
--
-- PR #239 (merge 94c6460b6c577e66e573a3a1d53f11a8edd5feae) changed services/cs2-demo-parser/raw_evidence.py: fields the
-- adapter / hot payload consume while labelled RAW_ONLY_INTENTIONAL are now MAPPED/DERIVED, a reviewed IGNORED_APPROVED
-- table was added and duplicate listings removed (labels only; UNMAPPED still blocks; no metric changes). The worker was
-- released under the standing watch-pattern freeze (/services/cs2-demo-parser/.release-freeze-r5-8-17) as ONE controlled
-- Railway deployment of that merge commit: 7324404e-f15d-45a0-8ec7-518a0770ca81, semantic = build = 94c6460b...
-- Critical blobs: raw_evidence.py f906889c... -> b72c3174...; parser/adapter/worker/settings blobs and the approved
-- workflow blob are unchanged (docs/reference/r5_8_23/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.22 targets (or is a no-op at the R5.8.23 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5823$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['2a7b517911981b45ca57947a8b1627be', '8253e121dbcd90aa86a70296eb05d961'];
  _target_md5 constant text[] := ARRAY['ea3ba14c6cabd8013e6fc8a50c036158', 'fb659f89da5963b778aa18c668e7fd54'];
  _old_deployment constant text := '2edd7ed1-2703-42ad-abe3-ebe13d235e81';
  _new_deployment constant text := '7324404e-f15d-45a0-8ec7-518a0770ca81';
  _old_commit constant text := 'c764f858ffa9df0ffa2740bdba450c7a37be2f3e';
  _new_commit constant text := '94c6460b6c577e66e573a3a1d53f11a8edd5feae';
  _old_raw_blob constant text := 'f906889c795a7e6e8a41902e8e453f3f5b9d956e';
  _new_raw_blob constant text := 'b72c3174216f833522d66d8bc6c43f1af2d6fb17';
  -- Expected occurrences per function: deployment, commit (semantic = build), raw_evidence.py blob.
  _deployment_count constant integer[] := ARRAY[1, 1];
  _commit_count constant integer[] := ARRAY[4, 3];
  _raw_blob_count constant integer[] := ARRAY[1, 0];
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
    RAISE EXCEPTION 'R5_8_23_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
       AND pg_catalog.strpos(_definition, _old_raw_blob) = 0 THEN
      RAISE NOTICE 'R5_8_23_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_deployment, ''))) / pg_catalog.length(_old_deployment) = _deployment_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_commit, ''))) / pg_catalog.length(_old_commit) = _commit_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_raw_blob, ''))) / pg_catalog.length(_old_raw_blob) = _raw_blob_count[_i]
       AND pg_catalog.strpos(_definition, _new_deployment) = 0
       AND pg_catalog.strpos(_definition, _new_commit) = 0
       AND pg_catalog.strpos(_definition, _new_raw_blob) = 0 THEN
      _definition := pg_catalog.replace(_definition, _old_deployment, _new_deployment);
      _definition := pg_catalog.replace(_definition, _old_commit, _new_commit);
      _definition := pg_catalog.replace(_definition, _old_raw_blob, _new_raw_blob);
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_commit, ''))) / pg_catalog.length(_new_commit) <> _commit_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_deployment, ''))) / pg_catalog.length(_new_deployment) <> _deployment_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_raw_blob, ''))) / pg_catalog.length(_new_raw_blob) <> _raw_blob_count[_i] THEN
        RAISE EXCEPTION 'R5_8_23_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_23_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_23_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_23_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5823$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.23 re-pinned recorder: Railway deployment 7324404e-f15d-45a0-8ec7-518a0770ca81 (controlled release of 94c6460b), semantic git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, build git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, parser.py blob 0dcb5962a0c977ab7a82326ebf8a0ef70bafde02, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, raw_evidence.py blob b72c3174216f833522d66d8bc6c43f1af2d6fb17, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.23 re-pinned provenance assertion: Railway deployment 7324404e-f15d-45a0-8ec7-518a0770ca81, semantic git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, build git:94c6460b6c577e66e573a3a1d53f11a8edd5feae, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
