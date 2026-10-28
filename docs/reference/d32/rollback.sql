-- Rollback of 20261028090000_d32_quarantined_content_reobservable.sql (NOT applied; reference).
-- Restores persist_canonical_observation to md5 3420e6cc7454132d8fa452127727a093 by the inverse exact
-- fragment replacement, then restores the two content-uniqueness indexes without the D32 exclusion.
-- Recreating the indexes FAILS (unique violation) once a verified match shares its content with the
-- quarantined match a7b27f16: by then a rollback would have to choose which row keeps the content,
-- which is a separate, explicit decision. Nothing here writes a row.

BEGIN;
DO $d32_rollback$
DECLARE
  _target constant regprocedure := 'public.persist_canonical_observation(jsonb,uuid,uuid)'::regprocedure;
  _old constant text[] := ARRAY[
$frag$  IF _source_id IS NULL AND _fp IS NOT NULL THEN
    -- D32: a quarantined (pre-provenance) observation is history, not this content's identity.
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
       AND (match_id IS NULL OR NOT public.is_canonical_match_quarantined(match_id))
     FOR UPDATE;
  END IF;$frag$,
$frag$    SELECT id INTO _match_id FROM public.matches
     WHERE content_fingerprint = _fp AND NOT public.is_canonical_match_quarantined(id)
     FOR UPDATE;$frag$];
  _new constant text[] := ARRAY[
$frag$  IF _source_id IS NULL AND _fp IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
     FOR UPDATE;
  END IF;$frag$,
$frag$    SELECT id INTO _match_id FROM public.matches WHERE content_fingerprint = _fp FOR UPDATE;$frag$];
  _expected_before constant text := 'a72ac136f4b482b84ff6e712689cc2a1';
  _expected_after constant text := '3420e6cc7454132d8fa452127727a093';
  _definition text;
  _src text;
  _before jsonb;
  _after jsonb;
  _i integer;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src = _expected_after THEN
    RAISE NOTICE 'D32_ROLLBACK_ALREADY_AT_TARGET_STATE';
    RETURN;
  END IF;
  IF _src IS DISTINCT FROM _expected_before THEN
    RAISE EXCEPTION 'D32_ROLLBACK_UNEXPECTED_FUNCTION_STATE: md5=%', _src USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'D32_ROLLBACK_FRAGMENT_NOT_UNIQUE: %', _i USING ERRCODE = '55000';
    END IF;
    _definition := pg_catalog.replace(_definition, _old[_i], _new[_i]);
  END LOOP;
  EXECUTE _definition;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src IS DISTINCT FROM _expected_after THEN
    RAISE EXCEPTION 'D32_ROLLBACK_POSTCONDITION_INVALID: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _after
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'D32_ROLLBACK_FUNCTION_PROPERTIES_CHANGED: before=% after=%', _before, _after USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'D32_ROLLBACK_PATCHED: md5 % -> %', _expected_before, _src;
END;
$d32_rollback$;

DROP INDEX IF EXISTS public.matches_content_fingerprint_uniq;
CREATE UNIQUE INDEX matches_content_fingerprint_uniq
  ON public.matches USING btree (content_fingerprint) WHERE (content_fingerprint IS NOT NULL);
DROP INDEX IF EXISTS public.match_sources_source_fingerprint_uniq;
CREATE UNIQUE INDEX match_sources_source_fingerprint_uniq
  ON public.match_sources USING btree (source, fingerprint) WHERE (fingerprint IS NOT NULL);

COMMIT;
