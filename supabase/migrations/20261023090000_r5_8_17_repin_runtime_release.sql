-- R5.8.17: re-pin the runtime identity after the D25 parser release, without rewriting prior migrations.
--
-- PR #184 (merge 2aa2a497421367a1ba205633eb23f5e69f95cd74) changed services/cs2-demo-parser/parser.py (D25: a bomb event absent
-- from the demo's own successfully enumerated event inventory is zero occurrences, not an unreadable
-- stream). The worker was released under a watch-pattern freeze (/services/cs2-demo-parser/.release-freeze-r5-8-17)
-- as ONE controlled Railway deployment of that merge commit: deployment 02e64c36-75de-4d88-aa15-e3c661879d64, semantic = build = 2aa2a497...
-- The parser.py critical blob changed aec5f33b... -> d55e7929...; adapter/worker/raw_evidence/settings
-- blobs and the approved workflow blob are unchanged (docs/reference/r5_8_17/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.16 targets (or is a no-op at the R5.8.17 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5817$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['35198be8e0e9faeac618b4435ebb8d4f', '0f1d4e412cd22705c64c033dc0b80df8'];
  _target_md5 constant text[] := ARRAY['4b0973036c801e2bd4604bf4b6321943', 'eb5c01dd48ae19f1aeae8cc9adffdf9d'];
  _old_deployment constant text := '1886c473-5251-4110-8ba3-60821e0b256b';
  _new_deployment constant text := '02e64c36-75de-4d88-aa15-e3c661879d64';
  _old_commit constant text := '4716f89429fd85f828e1e786d6520895d7bece53';
  _new_commit constant text := '2aa2a497421367a1ba205633eb23f5e69f95cd74';
  _old_parser_blob constant text := 'aec5f33b51373bfc69e3b51ea055fefa6352b26a';
  _new_parser_blob constant text := 'd55e7929a54a811d66b1f1f214abd8bea3fb2e40';
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
    RAISE EXCEPTION 'R5_8_17_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
      RAISE NOTICE 'R5_8_17_ALREADY_AT_TARGET_STATE: %', _target;
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
        RAISE EXCEPTION 'R5_8_17_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_17_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_17_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_17_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5817$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.17 re-pinned recorder: Railway deployment 02e64c36-75de-4d88-aa15-e3c661879d64 (controlled release of 2aa2a497), semantic git:2aa2a497421367a1ba205633eb23f5e69f95cd74, build git:2aa2a497421367a1ba205633eb23f5e69f95cd74, parser.py blob d55e7929a54a811d66b1f1f214abd8bea3fb2e40, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.17 re-pinned provenance assertion: Railway deployment 02e64c36-75de-4d88-aa15-e3c661879d64, semantic git:2aa2a497421367a1ba205633eb23f5e69f95cd74, build git:2aa2a497421367a1ba205633eb23f5e69f95cd74, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
