-- R5.8.21: re-pin the runtime identity after the D35/D36 parser release, without rewriting prior migrations.
--
-- PR #209 (merge e8f287500d53586f230a71eff17689969634ecd2) changed services/cs2-demo-parser/parser.py and adapter.py (D35: grenade
-- detonations carry the thrower and kills the game's flash-assist flag; D36: each round carries its freeze-end instant). The
-- worker was released under the standing watch-pattern freeze (/services/cs2-demo-parser/.release-freeze-r5-8-17) as ONE
-- controlled Railway deployment of that merge commit: 1c0f26d5-4064-4e6d-a552-2ce05ae517fe, semantic = build = e8f28750...
-- Critical blobs: parser.py 4bf17c9f... -> 0dcb5962..., adapter.py 34ce0f19... -> b9581168...; worker/raw_evidence/settings
-- blobs and the approved workflow blob are unchanged (docs/reference/r5_8_21/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.20 targets (or is a no-op at the R5.8.21 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5821$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['056e486322c9fd513eb2c0f56100084d', '145a05ae2a81c12bcc3b1f3795c230c9'];
  _target_md5 constant text[] := ARRAY['ed206712403e8ab989b350eb89abba15', '20d82451652846c95c4934c72c5d753d'];
  _old_deployment constant text := 'b0895901-1330-4676-9f57-95ddb99060c2';
  _new_deployment constant text := '1c0f26d5-4064-4e6d-a552-2ce05ae517fe';
  _old_commit constant text := 'c38f209d8d6e801930398c12cc8ac231e08efaf6';
  _new_commit constant text := 'e8f287500d53586f230a71eff17689969634ecd2';
  _old_parser_blob constant text := '4bf17c9fe5e10a105154b5d46a7ea1e05e971911';
  _new_parser_blob constant text := '0dcb5962a0c977ab7a82326ebf8a0ef70bafde02';
  _old_adapter_blob constant text := '34ce0f196a0ff86f5452c0e8b1f078f88f9b0c71';
  _new_adapter_blob constant text := 'b95811681be20b9e849672e57a07b1de5d18e6e8';
  -- Expected occurrences per function: deployment, commit (semantic = build), parser.py blob, adapter.py blob.
  _deployment_count constant integer[] := ARRAY[1, 1];
  _commit_count constant integer[] := ARRAY[4, 3];
  _parser_blob_count constant integer[] := ARRAY[1, 0];
  _adapter_blob_count constant integer[] := ARRAY[1, 0];
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
    RAISE EXCEPTION 'R5_8_21_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
       AND pg_catalog.strpos(_definition, _old_parser_blob) = 0
       AND pg_catalog.strpos(_definition, _old_adapter_blob) = 0 THEN
      RAISE NOTICE 'R5_8_21_ALREADY_AT_TARGET_STATE: %', _target;
    ELSIF _md5 = _start_md5[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_deployment, ''))) / pg_catalog.length(_old_deployment) = _deployment_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_commit, ''))) / pg_catalog.length(_old_commit) = _commit_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_parser_blob, ''))) / pg_catalog.length(_old_parser_blob) = _parser_blob_count[_i]
       AND (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old_adapter_blob, ''))) / pg_catalog.length(_old_adapter_blob) = _adapter_blob_count[_i]
       AND pg_catalog.strpos(_definition, _new_deployment) = 0
       AND pg_catalog.strpos(_definition, _new_commit) = 0
       AND pg_catalog.strpos(_definition, _new_parser_blob) = 0
       AND pg_catalog.strpos(_definition, _new_adapter_blob) = 0 THEN
      _definition := pg_catalog.replace(_definition, _old_deployment, _new_deployment);
      _definition := pg_catalog.replace(_definition, _old_commit, _new_commit);
      _definition := pg_catalog.replace(_definition, _old_parser_blob, _new_parser_blob);
      _definition := pg_catalog.replace(_definition, _old_adapter_blob, _new_adapter_blob);
      EXECUTE _definition;
      _definition := pg_catalog.pg_get_functiondef(_target);
      SELECT pg_catalog.md5(p.prosrc) INTO STRICT _md5 FROM pg_catalog.pg_proc p WHERE p.oid = _target;
      IF _md5 IS DISTINCT FROM _target_md5[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_commit, ''))) / pg_catalog.length(_new_commit) <> _commit_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_deployment, ''))) / pg_catalog.length(_new_deployment) <> _deployment_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_parser_blob, ''))) / pg_catalog.length(_new_parser_blob) <> _parser_blob_count[_i]
         OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new_adapter_blob, ''))) / pg_catalog.length(_new_adapter_blob) <> _adapter_blob_count[_i] THEN
        RAISE EXCEPTION 'R5_8_21_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_21_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_21_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_21_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5821$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.21 re-pinned recorder: Railway deployment 1c0f26d5-4064-4e6d-a552-2ce05ae517fe (controlled release of e8f28750), semantic git:e8f287500d53586f230a71eff17689969634ecd2, build git:e8f287500d53586f230a71eff17689969634ecd2, parser.py blob 0dcb5962a0c977ab7a82326ebf8a0ef70bafde02, adapter.py blob b95811681be20b9e849672e57a07b1de5d18e6e8, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.21 re-pinned provenance assertion: Railway deployment 1c0f26d5-4064-4e6d-a552-2ce05ae517fe, semantic git:e8f287500d53586f230a71eff17689969634ecd2, build git:e8f287500d53586f230a71eff17689969634ecd2, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
