-- R5.8.24: re-pin the runtime identity after spatial-v1 layer A, without rewriting prior migrations.
--
-- PR #267 (merge 4badf6060e4e69a589179567f488f5d58a4a58dc) changed services/cs2-demo-parser/parser.py (player_death is read
-- with the player positions X/Y/Z at the death tick; demoparser2 0.42.0 takes them as keyword-only `player=`) and
-- raw_evidence.py (the new attacker_/user_ position fields are MAPPED, assister_ positions RAW-only). The adapter and the
-- canonical normalizer already mapped `position` / `victim_position`; no metric changes. The worker was released under the
-- standing watch-pattern freeze (/services/cs2-demo-parser/.release-freeze-r5-8-17) as ONE controlled Railway deployment of
-- that merge commit: 0ff96670-e373-4beb-90c9-f1967eee3195, semantic = build = 4badf606...
-- Critical blobs: parser.py 0dcb5962... -> 4102f617...; raw_evidence.py b72c3174... -> 5b7b674c...; adapter/worker/settings
-- blobs and the approved workflow blob are unchanged (docs/reference/r5_8_24/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.23 targets (or is a no-op at the R5.8.24 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5824$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['ea3ba14c6cabd8013e6fc8a50c036158', 'fb659f89da5963b778aa18c668e7fd54'];
  _target_md5 constant text[] := ARRAY['c28ed93d37612ffdbe02653d8ea980eb', 'c661f1f3adf774a3376c2ed510bfe607'];
  _old_deployment constant text := '7324404e-f15d-45a0-8ec7-518a0770ca81';
  _new_deployment constant text := '0ff96670-e373-4beb-90c9-f1967eee3195';
  _old_commit constant text := '94c6460b6c577e66e573a3a1d53f11a8edd5feae';
  _new_commit constant text := '4badf6060e4e69a589179567f488f5d58a4a58dc';
  _old_raw_blob constant text := 'b72c3174216f833522d66d8bc6c43f1af2d6fb17';
  _new_raw_blob constant text := '5b7b674c88a77f85ab8791f84a47a188889b5802';
  _old_parser_blob constant text := '0dcb5962a0c977ab7a82326ebf8a0ef70bafde02';
  _new_parser_blob constant text := '4102f6174e4dc01d97637174f4f70fe53629c285';
  -- Expected occurrences per function: deployment, commit (semantic = build), raw_evidence.py blob, parser.py blob.
  _deployment_count constant integer[] := ARRAY[1, 1];
  _commit_count constant integer[] := ARRAY[4, 3];
  _raw_blob_count constant integer[] := ARRAY[1, 0];
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
    RAISE EXCEPTION 'R5_8_24_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
       AND pg_catalog.strpos(_definition, _old_raw_blob) = 0
       AND pg_catalog.strpos(_definition, _old_parser_blob) = 0 THEN
      RAISE NOTICE 'R5_8_24_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_deployment, ''))) / pg_catalog.length(_old_deployment) = _deployment_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_commit, ''))) / pg_catalog.length(_old_commit) = _commit_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_raw_blob, ''))) / pg_catalog.length(_old_raw_blob) = _raw_blob_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_parser_blob, ''))) / pg_catalog.length(_old_parser_blob) = _parser_blob_count[_i]
       AND pg_catalog.strpos(_definition, _new_deployment) = 0
       AND pg_catalog.strpos(_definition, _new_commit) = 0
       AND pg_catalog.strpos(_definition, _new_raw_blob) = 0
       AND pg_catalog.strpos(_definition, _new_parser_blob) = 0 THEN
      _definition := pg_catalog.replace(_definition, _old_deployment, _new_deployment);
      _definition := pg_catalog.replace(_definition, _old_commit, _new_commit);
      _definition := pg_catalog.replace(_definition, _old_raw_blob, _new_raw_blob);
      _definition := pg_catalog.replace(_definition, _old_parser_blob, _new_parser_blob);
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_commit, ''))) / pg_catalog.length(_new_commit) <> _commit_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_deployment, ''))) / pg_catalog.length(_new_deployment) <> _deployment_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_raw_blob, ''))) / pg_catalog.length(_new_raw_blob) <> _raw_blob_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_parser_blob, ''))) / pg_catalog.length(_new_parser_blob) <> _parser_blob_count[_i] THEN
        RAISE EXCEPTION 'R5_8_24_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_24_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_24_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_24_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5824$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.24 re-pinned recorder: Railway deployment 0ff96670-e373-4beb-90c9-f1967eee3195 (controlled release of 4badf606), semantic git:4badf6060e4e69a589179567f488f5d58a4a58dc, build git:4badf6060e4e69a589179567f488f5d58a4a58dc, parser.py blob 4102f6174e4dc01d97637174f4f70fe53629c285, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, raw_evidence.py blob 5b7b674c88a77f85ab8791f84a47a188889b5802, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.24 re-pinned provenance assertion: Railway deployment 0ff96670-e373-4beb-90c9-f1967eee3195, semantic git:4badf6060e4e69a589179567f488f5d58a4a58dc, build git:4badf6060e4e69a589179567f488f5d58a4a58dc, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
