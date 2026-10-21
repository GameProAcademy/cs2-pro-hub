-- D19: one demo content, many users - shared Canonical match, independent identity (forward-only).
--
-- Canonical matches are content-addressed: one matches row per demo SHA-256, and
-- match_sources keeps ONE row per (source, fingerprint) whose upload_id is overwritten by
-- every later upload of the same content. Two functions assumed one uploader per content:
--
-- * record_demo_identity_event resolved the job's match from match_sources.upload_id =
--   this job's upload, so after user B uploaded the same demo, user A's (and every earlier
--   uploader's) declaration failed with MATCH_NOT_ANALYSED;
-- * owns_canonical_match granted read access only to matches.player_id (the first
--   uploader) or to a participant already linked to the user's player, so a second
--   uploader could not read the shared match or its participant list at all.
--
-- Proven on a disposable database built from supabase/migrations by
-- scripts/queue/multi_user_identity_probe.py (PR #172, first commit: 4/9 PASS; B and C read
-- 0/0 of the shared match; A and B MATCH_NOT_ANALYSED; only the last uploader succeeded).
--
-- Fix, by exact fragment replacement inside the existing definitions (owner, SECURITY
-- DEFINER, search_path, volatility and ACL preserved and checked):
-- * record_demo_identity_event: resolve from the job's own match_id, then from the job's own
--   demo content (never a quarantined match), and only then from its upload's source row;
-- * owns_canonical_match: also true for a user whose own demo job resolved to that match.
-- Personal rows (decisions, metrics, features, nickname history) keep their own per-user /
-- per-player policies; nothing here grants access to them. No row, grant or table changes.
-- Production md5(prosrc): owns_canonical_match 847c818d... -> 0ac21d3d...,
-- record_demo_identity_event 57bcb5f3... -> 4ccf85be... (computed read-only on production).
BEGIN;

DO $d19$
DECLARE
  _targets constant regprocedure[] := ARRAY[
    'public.record_demo_identity_event(uuid,uuid,text,jsonb)'::regprocedure,
    'public.owns_canonical_match(uuid)'::regprocedure
  ];
  _old constant text[] := ARRAY[$frag$    SELECT ms.match_id
    INTO _canonical_match_id
    FROM public.match_sources ms
    WHERE ms.upload_id = _job.upload_id
      AND ms.source = 'demo'
      AND ms.match_id IS NOT NULL
    ORDER BY ms.updated_at DESC, ms.created_at DESC
    LIMIT 1;$frag$, $frag$     WHERE mp.match_id = _match_id AND p.user_id = auth.uid()
  );$frag$];
  _new constant text[] := ARRAY[$frag$    -- D19: one demo content is ONE Canonical match shared by every uploader, and
    -- match_sources keeps one row per content whose upload_id names only the latest
    -- uploader. Resolve this job's match from the job itself, then from its own demo
    -- content (never a quarantined match), and only then from its upload's source row.
    _canonical_match_id := _job.match_id;
    IF _canonical_match_id IS NULL AND _job.demo_sha256 IS NOT NULL THEN
      SELECT m.id INTO _canonical_match_id
      FROM public.matches m
      WHERE m.content_fingerprint = _job.demo_sha256
        AND NOT EXISTS (SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id = m.id);
    END IF;
    IF _canonical_match_id IS NULL THEN
      SELECT ms.match_id
      INTO _canonical_match_id
      FROM public.match_sources ms
      WHERE ms.upload_id = _job.upload_id
        AND ms.source = 'demo'
        AND ms.match_id IS NOT NULL
      ORDER BY ms.updated_at DESC, ms.created_at DESC
      LIMIT 1;
    END IF;$frag$, $frag$     WHERE mp.match_id = _match_id AND p.user_id = auth.uid()
  ) OR EXISTS (
    -- D19: every user whose own demo job resolved to this Canonical match (the same
    -- demo content) reads the shared match facts; personal rows stay player-scoped.
    SELECT 1 FROM public.demo_jobs j
     WHERE j.match_id = _match_id AND j.user_id = auth.uid()
  );$frag$];
  _marker constant text[] := ARRAY['D19: one demo content is ONE Canonical match', 'D19: every user whose own demo job'];
  _i integer;
  _target regprocedure;
  _definition text;
  _before jsonb;
  _after jsonb;
  _count integer;
BEGIN
  FOR _i IN 1 .. pg_catalog.array_length(_targets, 1) LOOP
    _target := _targets[_i];
    SELECT pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
      'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
      'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
      'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
      INTO STRICT _before
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
    _definition := pg_catalog.pg_get_functiondef(_target);
    _count := (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _old[_i], '')))
              / pg_catalog.length(_old[_i]);
    IF pg_catalog.strpos(_definition, _marker[_i]) > 0 AND _count = 0 THEN
      RAISE NOTICE 'D19_ALREADY_AT_TARGET_STATE: %', _target;
      CONTINUE;
    ELSIF _count IS DISTINCT FROM 1 OR pg_catalog.strpos(_definition, _marker[_i]) > 0 THEN
      RAISE EXCEPTION 'D19_UNEXPECTED_FUNCTION_STATE: % fragment_count=%', _target, _count USING ERRCODE = '55000';
    END IF;
    EXECUTE pg_catalog.replace(_definition, _old[_i], _new[_i]);
    _definition := pg_catalog.pg_get_functiondef(_target);
    IF pg_catalog.strpos(_definition, _marker[_i]) = 0
       OR (pg_catalog.length(_definition) - pg_catalog.length(pg_catalog.replace(_definition, _new[_i], '')))
          / pg_catalog.length(_new[_i]) <> 1 THEN
      RAISE EXCEPTION 'D19_POSTCONDITION_INVALID: %', _target USING ERRCODE = '55000';
    END IF;
    SELECT pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
      'volatility', p.provolatile, 'strict', p.proisstrict, 'config', p.proconfig::text,
      'acl', p.proacl::text, 'language', l.lanname, 'return_type', pg_catalog.pg_get_function_result(p.oid),
      'arg_types', p.proargtypes::text, 'arg_names', p.proargnames::text)
      INTO STRICT _after
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = _target;
    IF _before IS DISTINCT FROM _after THEN
      RAISE EXCEPTION 'D19_FUNCTION_PROPERTIES_CHANGED: % before=% after=%', _target, _before, _after
        USING ERRCODE = '55000';
    END IF;
    RAISE NOTICE 'D19_PATCHED: %', _target;
  END LOOP;
END;
$d19$;

COMMIT;
