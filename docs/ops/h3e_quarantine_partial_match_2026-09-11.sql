-- H.3-E operator step (NOT a migration): quarantine the single pre-provenance Canonical row.
--
-- Requires, in this order, each as its own explicitly authorized operation:
--   1. supabase/migrations/20261014120000_h3e_canonical_match_quarantine.sql applied;
--   2. supabase/migrations/20261014120100_h3e_predem_managed_snapshot_v3.sql applied;
--   3. this file run once on the managed database.
-- The match is not modified: no column, status, child row or provenance changes. The only
-- write is one row in the append-only quarantine registry. Every precondition is asserted
-- first; any difference from the identity observed read-only on 2026-10-13 aborts with no write.
-- Re-running after success is a no-op (NOTICE), never a second row.
DO $quarantine$
DECLARE
  _id constant uuid := 'a7b27f16-4c85-428b-a855-0f683bda48a2';
  _m public.matches%ROWTYPE;
  _evidence jsonb;
BEGIN
  IF pg_catalog.to_regclass('public.canonical_match_quarantine') IS NULL THEN
    RAISE EXCEPTION 'H3E_QUARANTINE_MIGRATION_NOT_APPLIED' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.canonical_match_quarantine WHERE match_id = _id) THEN
    RAISE NOTICE 'H3E_QUARANTINE_ALREADY_RECORDED';
    RETURN;
  END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _id FOR SHARE;
  IF NOT FOUND
     OR _m.canonical_status IS DISTINCT FROM 'partial'
     OR _m.canonical_source::text IS DISTINCT FROM 'demo'
     OR _m.canonical_schema_version IS DISTINCT FROM 2
     OR _m.created_at IS DISTINCT FROM '2026-09-11 10:40:06.477964+00'::timestamptz
     OR _m.content_fingerprint IS DISTINCT FROM '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d'
     OR _m.upload_id IS DISTINCT FROM '9b375fd1-6bf0-400b-be61-dbf70099e2c5'::uuid
     OR _m.round_count IS DISTINCT FROM 24
     OR NOT (_m.source_complete AND _m.finished AND _m.terminal) THEN
    RAISE EXCEPTION 'H3E_QUARANTINE_TARGET_IDENTITY_CHANGED' USING ERRCODE = '55000';
  END IF;
  IF (SELECT count(*) FROM public.matches) <> 1
     OR EXISTS (SELECT 1 FROM public.match_metrics WHERE match_id = _id)
     OR EXISTS (SELECT 1 FROM public.match_features WHERE match_id = _id) THEN
    RAISE EXCEPTION 'H3E_QUARANTINE_PRECONDITION_CHANGED' USING ERRCODE = '55000';
  END IF;
  _evidence := jsonb_build_object(
    'canonical_status', _m.canonical_status,
    'canonical_source', _m.canonical_source,
    'canonical_schema_version', _m.canonical_schema_version,
    'created_at', _m.created_at,
    'content_fingerprint', _m.content_fingerprint,
    'upload_id', _m.upload_id,
    'round_count', _m.round_count,
    'child_rows', jsonb_build_object(
      'match_sources', (SELECT count(*) FROM public.match_sources WHERE match_id = _id),
      'match_participants', (SELECT count(*) FROM public.match_participants WHERE match_id = _id),
      'match_rounds', (SELECT count(*) FROM public.match_rounds WHERE match_id = _id),
      'round_players', (SELECT count(*) FROM public.round_players WHERE match_id = _id),
      'round_events', (SELECT count(*) FROM public.round_events WHERE match_id = _id)),
    'first_verified_provenance_at',
      (SELECT min(created_at) FROM public.parser_runtime_provenance WHERE status = 'VERIFIED'),
    'rule', 'STRICT_PROVENANCE: created before the first VERIFIED parser provenance; no provenance link');
  INSERT INTO public.canonical_match_quarantine (match_id, reason, decision_ref, quarantined_by, evidence)
  VALUES (_id, 'PRE_PROVENANCE_CANONICAL_ROW',
          'H3E-CANONICAL-PARTIAL-2026-09-11: preserve, do not promote, isolate from eligibility',
          'owner-authorized operator step', _evidence);
  RAISE NOTICE 'H3E_QUARANTINE_RECORDED';
END;
$quarantine$;
