-- R5.8.19: re-pin the runtime identity after the D30 parser release, without rewriting prior migrations.
--
-- PR #196 (merge 47ed645407c97bb5cb9554bc5777dc21ff7b11ef) changed services/cs2-demo-parser/parser.py (D30: rounds the game discarded by
-- resetting its round counter, e.g. a knife round, are not match rounds). The worker was released under a watch-pattern freeze (/services/cs2-demo-parser/.release-freeze-r5-8-17)
-- as ONE controlled Railway deployment of that merge commit: deployment 7179fcce-cb04-4c35-9d4b-eb025166b4fd, semantic = build = 47ed6454...
-- The parser.py critical blob changed ff3ee9f6... -> 20ff3dfb...; adapter/worker/raw_evidence/settings
-- blobs and the approved workflow blob are unchanged (docs/reference/r5_8_19/spec.json).
--
-- This migration replaces exactly those pins in the recorder and in the provenance assertion.
-- It starts only from the R5.8.18 targets (or is a no-op at the R5.8.19 targets), checks exact
-- occurrence counts and md5(prosrc) before and after, preserves every function property, and
-- touches no row, grant, trigger or index. Any other state fails closed.
BEGIN;

DO $r5819$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)'::regprocedure,
    'public.assert_verified_parser_provenance(uuid)'::regprocedure
  ];
  _start_md5 constant text[] := ARRAY['d933b9e73bd850fff668a4d27a7a494e', '090e73dc4f937b514fcbc54cdd462457'];
  _target_md5 constant text[] := ARRAY['7f78aec6241efb8cf188156ddeeffbcd', 'bb393072eb936fb983697240c874e17b'];
  _old_deployment constant text := '13873137-13fe-4d09-9038-0fc680f1e91c';
  _new_deployment constant text := '7179fcce-cb04-4c35-9d4b-eb025166b4fd';
  _old_commit constant text := 'bc421879aced9fe0eaf5e4b900ff2ce6da0752e8';
  _new_commit constant text := '47ed645407c97bb5cb9554bc5777dc21ff7b11ef';
  _old_parser_blob constant text := 'ff3ee9f6236cf6c9b3da676ff4d6376ce21f993e';
  _new_parser_blob constant text := '20ff3dfb98505a8fcd25c38f2aff12eab076684e';
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
    RAISE EXCEPTION 'R5_8_19_R5_8_12_WORKFLOW_STATE_MISSING: %', _md5 USING ERRCODE = '55000';
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
      RAISE NOTICE 'R5_8_19_ALREADY_AT_TARGET_STATE: %', _target;
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
        RAISE EXCEPTION 'R5_8_19_POSTCONDITION_INVALID: % md5=%', _target, _md5 USING ERRCODE = '55000';
      END IF;
      RAISE NOTICE 'R5_8_19_REPINNED: %', _target;
    ELSE
      RAISE EXCEPTION 'R5_8_19_UNEXPECTED_PIN_STATE: % md5=%', _target, _md5 USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'R5_8_19_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target,
        _before_properties, _after_properties USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$r5819$;

COMMENT ON FUNCTION public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb,timestamptz,text)
  IS 'R5.8.19 re-pinned recorder: Railway deployment 7179fcce-cb04-4c35-9d4b-eb025166b4fd (controlled release of 47ed6454), semantic git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, build git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, parser.py blob 20ff3dfb98505a8fcd25c38f2aff12eab076684e, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';
COMMENT ON FUNCTION public.assert_verified_parser_provenance(uuid)
  IS 'R5.8.19 re-pinned provenance assertion: Railway deployment 7179fcce-cb04-4c35-9d4b-eb025166b4fd, semantic git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, build git:47ed645407c97bb5cb9554bc5777dc21ff7b11ef, approved workflow blob f5e8ffb19d03dca410591f8d2fd38dc47a3ca485.';

COMMIT;
