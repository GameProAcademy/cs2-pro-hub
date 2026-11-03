-- R5.8.22: re-pin the runtime identity after the player_disconnect.ever_fully_connected review, without rewriting prior migrations.
--
-- PR #232 (merge c764f858ffa9df0ffa2740bdba450c7a37be2f3e) changed services/cs2-demo-parser/raw_evidence.py only: a newer CS2
-- build adds ever_fully_connected to player_disconnect, and as the single UNMAPPED_BUT_AVAILABLE field it blocked production
-- job e4088318 (RAW-EVIDENCE-01, RAW→CANONICAL). The field is now reviewed as RAW-only. The worker was released under the
-- standing watch-pattern freeze (/services/cs2-demo-parser/.release-freeze-r5-8-17) as ONE controlled Railway deployment of that
-- merge commit: 2edd7ed1-2703-42ad-abe3-ebe13d235e81, semantic = build = c764f858...
-- Critical blobs: raw_evidence.py 001281ee... -> f906889c...; parser/adapter/worker/settings blobs and the approved workflow
-- blob are unchanged (docs/reference/r5_8_22/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.21 targets (or is a no-op at the R5.8.22 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5822$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['ed206712403e8ab989b350eb89abba15', '20d82451652846c95c4934c72c5d753d'];
  _target_md5 constant text[] := ARRAY['2a7b517911981b45ca57947a8b1627be', '8253e121dbcd90aa86a70296eb05d961'];
  _old_deployment constant text := '1c0f26d5-4064-4e6d-a552-2ce05ae517fe';
  _new_deployment constant text := '2edd7ed1-2703-42ad-abe3-ebe13d235e81';
  _old_commit constant text := 'e8f287500d53586f230a71eff17689969634ecd2';
  _new_commit constant text := 'c764f858ffa9df0ffa2740bdba450c7a37be2f3e';
  _old_raw_blob constant text := '001281eecb02ebc318ff997f734c4081c161d1d9';
  _new_raw_blob constant text := 'f906889c795a7e6e8a41902e8e453f3f5b9d956e';
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
    RAISE EXCEPTION 'R5_8_22_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
      RAISE NOTICE 'R5_8_22_ALREADY_AT_TARGET_STATE: %', _target;
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
        RAISE EXCEPTION 'R5_8_22_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_22_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_22_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_22_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5822$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.22 re-pinned recorder: Railway deployment 2edd7ed1-2703-42ad-abe3-ebe13d235e81 (controlled release of c764f858), semantic git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, build git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, parser.py blob 0dcb5962a0c977ab7a82326ebf8a0ef70bafde02, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, raw_evidence.py blob f906889c795a7e6e8a41902e8e453f3f5b9d956e, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.22 re-pinned provenance assertion: Railway deployment 2edd7ed1-2703-42ad-abe3-ebe13d235e81, semantic git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, build git:c764f858ffa9df0ffa2740bdba450c7a37be2f3e, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
