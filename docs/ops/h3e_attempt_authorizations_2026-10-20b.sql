-- H.3-E operator step (NOT a migration): record the owner's authorization of job 7131abd3
-- (attempt 12 of the reference DEM 0caa7c97, m1-cache), created by the owner's upload on 2026-10-20.
--
-- Owner decision (chat, 2026-10-20T06:4x-03:00, AskUserQuestion answer "m2-mirage e m1-cache"):
-- the owner uploads m1-cache again as attempt 12 for the real E2E proof of D12 and authorizes that
-- attempt to be recorded. Same contract as h3e_attempt_authorizations_2026-10-20.sql: every identity
-- observed read-only is asserted first; the only write is one row in the append-only registry; the
-- job is not touched. Re-running after success is a no-op.
DO $authorize$
DECLARE
  _decision constant text := 'OWNER-CONFIRMATION 2026-10-20T06:4x-03:00 (chat): owner uploads m1-cache (reference DEM 0caa7c97) as attempt 12 for the real E2E proof of D12 (CPU-bounded RAW completion) and D13 (observed round boundaries) and authorizes recording that attempt.';
  _job constant uuid := '7131abd3-fc19-4fd1-ac29-c794f3253ecb';
  _upload constant uuid := 'ec674f06-6538-47b8-8670-2b111719087e';
  _supersedes constant uuid := '2dc1ddd1-1799-430e-b511-5cc1ebe25390';
  _created constant timestamptz := '2026-10-20 09:53:45.41284+00';
  _sha constant text := '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d';
BEGIN
  IF pg_catalog.to_regclass('public.h3e_attempt_authorizations') IS NULL THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_MIGRATION_NOT_APPLIED' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.h3e_attempt_authorizations x WHERE x.job_id = _job) THEN
    RAISE NOTICE 'H3E_ATTEMPT_AUTHORIZATION_ALREADY_RECORDED %', _job;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.demo_jobs j
                 WHERE j.id = _job AND j.upload_id = _upload AND j.attempt_number = 12
                   AND j.demo_sha256 = _sha AND j.supersedes_job_id = _supersedes
                   AND j.created_at = _created AND j.replacement_reason = 'failed'
                   AND j.user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be') THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_TARGET_CHANGED %', _job USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.h3e_attempt_authorizations (job_id, upload_id, attempt_number, demo_sha256, decision_ref,
                                                 authorized_by, evidence)
  VALUES (_job, _upload, 12, _sha, _decision, 'owner-confirmed operator step',
          jsonb_build_object('supersedes_job_id', _supersedes, 'job_created_at', _created,
                             'observed_read_only', '2026-10-20', 'purpose', 'real E2E proof of D12 and D13'));
  RAISE NOTICE 'H3E_ATTEMPT_AUTHORIZATION_RECORDED %', _job;
END;
$authorize$;
