-- H.3-E operator step (NOT a migration): record the owner's authorization of job b7579762
-- (attempt 13 of the reference DEM 0caa7c97, m1-cache), created by the owner's upload on 2026-10-21.
--
-- Owner decision (chat, 2026-10-20T22:36-03:00): after updating the three app secrets for the R5.8.15
-- runtime, the owner authorized proceeding with the real E2E; the agreed plan (chat, same evening)
-- was to re-upload m2-mirage (attempt 5) and m1-cache (attempt 13) and to record this attempt.
-- Same contract as h3e_attempt_authorizations_2026-10-20b.sql: every identity observed read-only is
-- asserted first; the only write is one row in the append-only registry; the job is not touched.
-- Re-running after success is a no-op.
DO $authorize$
DECLARE
  _decision constant text := 'OWNER-CONFIRMATION 2026-10-20T22:36-03:00 (chat): owner updated the R5.8.15 app secrets and authorized the real E2E; owner uploads m1-cache (reference DEM 0caa7c97) as attempt 13 after D13b/D16 (R5.8.15) and authorizes recording that attempt.';
  _job constant uuid := 'b7579762-070b-44eb-86bd-530d7b44d492';
  _upload constant uuid := '9813cb0a-c144-4a98-8387-6eec950d4413';
  _supersedes constant uuid := '7131abd3-fc19-4fd1-ac29-c794f3253ecb';
  _created constant timestamptz := '2026-10-21 01:43:57.721833+00';
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
                 WHERE j.id = _job AND j.upload_id = _upload AND j.attempt_number = 13
                   AND j.demo_sha256 = _sha AND j.supersedes_job_id = _supersedes
                   AND j.created_at = _created AND j.replacement_reason = 'raw_audit_blocked'
                   AND j.user_id = '348b6f66-386d-48c4-bac1-7382ab12d7be') THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_TARGET_CHANGED %', _job USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.h3e_attempt_authorizations (job_id, upload_id, attempt_number, demo_sha256, decision_ref,
                                                 authorized_by, evidence)
  VALUES (_job, _upload, 13, _sha, _decision, 'owner-confirmed operator step',
          jsonb_build_object('supersedes_job_id', _supersedes, 'job_created_at', _created,
                             'observed_read_only', '2026-10-21', 'purpose', 'real E2E after R5.8.15 (D13b) and ruleset 2 (D16)'));
  RAISE NOTICE 'H3E_ATTEMPT_AUTHORIZATION_RECORDED %', _job;
END;
$authorize$;
