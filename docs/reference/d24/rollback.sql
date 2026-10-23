-- D24 rollback (manual, reviewed before use). Forward-only policy: prefer a new forward migration.
-- Refuses while any row already uses 'parser_upgrade' (those attempts are real history and are kept).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.uploads WHERE replacement_reason = 'parser_upgrade')
     OR EXISTS (SELECT 1 FROM public.demo_jobs WHERE replacement_reason = 'parser_upgrade') THEN
    RAISE EXCEPTION 'D24_ROLLBACK_REFUSED_PARSER_UPGRADE_ROWS_EXIST';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.reserve_demo_parser_upgrade_attempt(uuid, text, uuid, text, bigint, text);
ALTER TABLE public.uploads
  DROP CONSTRAINT IF EXISTS uploads_replacement_reason_check,
  ADD CONSTRAINT uploads_replacement_reason_check CHECK (
    replacement_reason IS NULL OR replacement_reason IN (
      'stale', 'failed', 'cancelled', 'legacy_unvalidated', 'raw_audit_blocked', 'g6r-real-demo-replay'));
ALTER TABLE public.demo_jobs
  DROP CONSTRAINT IF EXISTS demo_jobs_replacement_reason_check,
  ADD CONSTRAINT demo_jobs_replacement_reason_check CHECK (
    replacement_reason IS NULL OR replacement_reason IN (
      'stale', 'failed', 'cancelled', 'legacy_unvalidated', 'raw_audit_blocked', 'g6r-real-demo-replay'));
COMMIT;
