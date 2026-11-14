-- PM6 C: persist the cs2.match-integrity.v1 decision on the job, additively.
--
-- The app evaluates the official end of the match and the count of valid played rounds before
-- any canonical write (src/lib/pipeline/matchIntegrity.ts) and stores the decision here:
-- contract id, status code, eligibility, valid rounds, exclusions and the end signals with
-- their reliability. It is identity-free. A refused demo is also blocked through the existing
-- RAW-audit block with the stable reason MATCH_INTEGRITY:<status>.
--
-- The column is nullable (jobs before this contract have no decision; nothing is backfilled),
-- write-once (the decision of an attempt is evidence and cannot be rewritten), and readable by
-- the job owner through the existing demo_jobs RLS. Re-running is a no-op.
BEGIN;

ALTER TABLE public.demo_jobs ADD COLUMN IF NOT EXISTS match_integrity jsonb;

ALTER TABLE public.demo_jobs DROP CONSTRAINT IF EXISTS demo_jobs_match_integrity_shape;
ALTER TABLE public.demo_jobs ADD CONSTRAINT demo_jobs_match_integrity_shape CHECK (
  -- COALESCE: a CHECK that evaluates to NULL passes in PostgreSQL; a missing key must fail.
  match_integrity IS NULL OR COALESCE((
    jsonb_typeof(match_integrity) = 'object'
    AND match_integrity->>'contract' = 'cs2.match-integrity.v1'
    AND match_integrity->>'status' IN (
      'MATCH_COMPLETED', 'MATCH_SURRENDER_COMPLETED', 'MATCH_END_UNVERIFIED', 'MATCH_DEMO_TRUNCATED',
      'MATCH_DEMO_CORRUPTED', 'MATCH_FINAL_ROUND_INCOMPLETE', 'MATCH_INSUFFICIENT_ROUNDS',
      'MATCH_LIFECYCLE_INCONSISTENT', 'MATCH_PLAYER_COVERAGE_INSUFFICIENT')
    AND jsonb_typeof(match_integrity->'eligible') = 'boolean'
    AND jsonb_typeof(match_integrity->'validRounds') = 'number'
  ), false)
);

CREATE OR REPLACE FUNCTION public.guard_demo_job_match_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.match_integrity IS NOT NULL AND NEW.match_integrity IS DISTINCT FROM OLD.match_integrity THEN
    RAISE EXCEPTION 'MATCH_INTEGRITY_DECISION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS demo_jobs_match_integrity_guard ON public.demo_jobs;
CREATE TRIGGER demo_jobs_match_integrity_guard
  BEFORE UPDATE OF match_integrity ON public.demo_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_demo_job_match_integrity();

COMMIT;
