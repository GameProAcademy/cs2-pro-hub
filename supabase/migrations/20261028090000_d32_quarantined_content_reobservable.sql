-- D32 (2026-10-28): verified output of quarantined demo content gets its own Canonical match.
--
-- Production evidence: the reference DEM 0caa7c97 (m1-cache) can never be persisted. Its
-- pre-provenance Canonical row (match a7b27f16, source b63082cb, created 2026-09-11, before the
-- first VERIFIED parser provenance) is quarantined (PRE_PROVENANCE_CANONICAL_ROW, immutable, no
-- release path). Canonical matches are content-addressed: persist_canonical_observation resolved
-- every new observation of that content to the quarantined row, and the quarantine guards refused
-- the write (job b7579762, attempt 13: CANONICAL_PERSISTENCE_FAILED: CANONICAL_MATCH_QUARANTINED).
-- The unique indexes on matches.content_fingerprint and match_sources(source, fingerprint) also
-- reserve the content for that row, so a second, verified match could not be created either.
--
-- Change (forward-only; nothing in the quarantined row, its children or the registry is written):
--   * content resolution skips quarantined matches (match_sources by fingerprint and matches by
--     content_fingerprint use public.is_canonical_match_quarantined). A verified observation of the
--     same content therefore creates a new, eligible match with its own source;
--   * the two content-uniqueness indexes exclude exactly the quarantined pre-provenance rows, named
--     by id (a7b27f16 / b63082cb). Uniqueness among every other row is unchanged; content of any
--     future quarantine stays reserved (fail closed) until a reviewed migration names it.
-- record_demo_identity_event already resolves content to the non-quarantined match.
-- Function md5 (persist_canonical_observation): 3420e6cc7454132d8fa452127727a093 -> a72ac136f4b482b84ff6e712689cc2a1.
-- Owner, SECURITY DEFINER, search_path, volatility and ACL are asserted unchanged.
-- Rollback: docs/reference/d32/rollback.sql.

BEGIN;

DO $d32_pre$
BEGIN
  -- The named rows, when present (they are absent from disposable databases), must be exactly the
  -- quarantined pre-provenance match and its own source.
  IF EXISTS (SELECT 1 FROM public.matches WHERE id = 'a7b27f16-4c85-428b-a855-0f683bda48a2')
     AND NOT public.is_canonical_match_quarantined('a7b27f16-4c85-428b-a855-0f683bda48a2') THEN
    RAISE EXCEPTION 'D32_NAMED_MATCH_NOT_QUARANTINED' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_sources WHERE id = 'b63082cb-4220-4d0d-9b45-d6db6c119256'
               AND match_id IS DISTINCT FROM 'a7b27f16-4c85-428b-a855-0f683bda48a2') THEN
    RAISE EXCEPTION 'D32_NAMED_SOURCE_NOT_OF_THE_QUARANTINED_MATCH' USING ERRCODE = '55000';
  END IF;
END
$d32_pre$;

DROP INDEX IF EXISTS public.matches_content_fingerprint_uniq;
CREATE UNIQUE INDEX matches_content_fingerprint_uniq
  ON public.matches USING btree (content_fingerprint)
  WHERE content_fingerprint IS NOT NULL
    AND id <> 'a7b27f16-4c85-428b-a855-0f683bda48a2'::uuid;
COMMENT ON INDEX public.matches_content_fingerprint_uniq IS
  'One Canonical match per content. D32: the quarantined pre-provenance match a7b27f16 no longer reserves its content.';

DROP INDEX IF EXISTS public.match_sources_source_fingerprint_uniq;
CREATE UNIQUE INDEX match_sources_source_fingerprint_uniq
  ON public.match_sources USING btree (source, fingerprint)
  WHERE fingerprint IS NOT NULL
    AND id <> 'b63082cb-4220-4d0d-9b45-d6db6c119256'::uuid;
COMMENT ON INDEX public.match_sources_source_fingerprint_uniq IS
  'One source observation per (source, content). D32: the source b63082cb of the quarantined match a7b27f16 no longer reserves its content.';

DO $d32$
DECLARE
  _target constant regprocedure := 'public.persist_canonical_observation(jsonb,uuid,uuid)'::regprocedure;
  _old constant text[] := ARRAY[
$frag$  IF _source_id IS NULL AND _fp IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
     FOR UPDATE;
  END IF;$frag$,
$frag$    SELECT id INTO _match_id FROM public.matches WHERE content_fingerprint = _fp FOR UPDATE;$frag$];
  _new constant text[] := ARRAY[
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
  _expected_before constant text := '3420e6cc7454132d8fa452127727a093';
  _expected_after constant text := 'a72ac136f4b482b84ff6e712689cc2a1';
  _definition text;
  _src text;
  _before jsonb;
  _after jsonb;
  _i integer;
BEGIN
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src = _expected_after THEN
    RAISE NOTICE 'D32_ALREADY_AT_TARGET_STATE';
    RETURN;
  END IF;
  IF _src IS DISTINCT FROM _expected_before THEN
    RAISE EXCEPTION 'D32_UNEXPECTED_FUNCTION_STATE: md5=%', _src USING ERRCODE = '55000';
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
      RAISE EXCEPTION 'D32_FRAGMENT_NOT_UNIQUE: %', _i USING ERRCODE = '55000';
    END IF;
    _definition := pg_catalog.replace(_definition, _old[_i], _new[_i]);
  END LOOP;
  EXECUTE _definition;
  SELECT pg_catalog.md5(p.prosrc) INTO STRICT _src FROM pg_catalog.pg_proc p WHERE p.oid = _target;
  IF _src IS DISTINCT FROM _expected_after THEN
    RAISE EXCEPTION 'D32_POSTCONDITION_INVALID: md5=%', _src USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
    'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
    'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
    INTO STRICT _after
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'D32_FUNCTION_PROPERTIES_CHANGED: before=% after=%', _before, _after USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'D32_PATCHED: md5 % -> %', _expected_before, _src;
END;
$d32$;

COMMIT;
