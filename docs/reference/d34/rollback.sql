-- Rollback of 20261028100000_d34_identity_status_on_conflict.sql (NOT applied; reference).
-- Restores persist_canonical_observation to md5 a72ac136f4b482b84ff6e712689cc2a1 by the inverse exact fragment
-- replacement. Rows already written keep their identity_status; nothing here writes a row.

BEGIN;
DO $d34_rollback$
DECLARE
  _target constant regprocedure := 'public.persist_canonical_observation(jsonb,uuid,uuid)'::regprocedure;
  _old constant text[] := ARRAY[
$frag$      is_target_player = public.match_participants.is_target_player OR EXCLUDED.is_target_player,
      -- D34: identity_status follows the strongest evidence ever written and never
      -- degrades (unlinked < correlated < strongly_correlated < verified). 'conflict' is
      -- sticky: once any observation reports a conflict it is never cleared by a write.
      identity_status = CASE
        WHEN public.match_participants.identity_status = 'conflict'::public.identity_link_status
          OR EXCLUDED.identity_status = 'conflict'::public.identity_link_status
          THEN 'conflict'::public.identity_link_status
        WHEN pg_catalog.array_position(ARRAY['unlinked','correlated','strongly_correlated','verified']::public.identity_link_status[], EXCLUDED.identity_status)
           > pg_catalog.array_position(ARRAY['unlinked','correlated','strongly_correlated','verified']::public.identity_link_status[], public.match_participants.identity_status)
          THEN EXCLUDED.identity_status
        ELSE public.match_participants.identity_status END,
$frag$];
  _new constant text[] := ARRAY[
$frag$      is_target_player = public.match_participants.is_target_player OR EXCLUDED.is_target_player,
$frag$];
  _expected_before constant text := 'd751c4742f2efe23b293f5861d09df3b';
  _expected_after constant text := 'a72ac136f4b482b84ff6e712689cc2a1';
  _definition text;
  _src text;
  _before jsonb;
  _after jsonb;
  _i integer;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src = _expected_after THEN
    RAISE NOTICE 'D34_ROLLBACK_ALREADY_AT_TARGET_STATE';
    RETURN;
  END IF;
  IF _src IS DISTINCT FROM _expected_before THEN
    RAISE EXCEPTION 'D34_ROLLBACK_UNEXPECTED_FUNCTION_STATE: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _before
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  _definition := pg_catalog.pg_get_functiondef(_target);
  FOR _i IN 1 .. pg_catalog.array_length(_old, 1) LOOP
    IF (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old[_i], '')))
       / pg_catalog.length(_old[_i]) <> 1 THEN
      RAISE EXCEPTION 'D34_ROLLBACK_FRAGMENT_NOT_UNIQUE: %', _i USING ERRCODE = '55000';
    END IF;
    _definition := pg_catalog.replace(_definition, _old[_i], _new[_i]);
  END LOOP;
  EXECUTE _definition;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src IS DISTINCT FROM _expected_after THEN
    RAISE EXCEPTION 'D34_ROLLBACK_POSTCONDITION_INVALID: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _after
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'D34_ROLLBACK_FUNCTION_PROPERTIES_CHANGED: before=% after=%', _before, _after USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'D34_ROLLBACK_PATCHED: md5 % -> %', _expected_before, _src;
END;
$d34_rollback$;

COMMIT;
