-- H.3-E operator step (NOT a migration): record the owner's authorization of the two executions of
-- the reference DEM at attempt >= 9 that exist on the managed database (read-only, 2026-10-14).
--
-- PREPARED, NOT APPLIED. Run only after the OWNER confirms, in writing, that both executions were
-- authorized, and replace OWNER_DECISION_REF below with the reference of that confirmation; the
-- block refuses to run while the placeholder is present. Requires migration
-- 20261014220000_h3e_attempt_authorization_registry.sql. Every identity observed read-only is
-- asserted first; any difference aborts with no write. Re-running after success is a no-op.
-- The jobs are not modified: the only writes are rows in the append-only registry.
DO $authorize$
DECLARE
  _decision constant text := 'OWNER_DECISION_REF';
  _sha constant text := '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d';
  _row record;
BEGIN
  IF _decision = 'OWNER_DECISION_REF' THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_DECISION_NOT_RECORDED' USING ERRCODE = '55000';
  END IF;
  IF pg_catalog.to_regclass('public.h3e_attempt_authorizations') IS NULL THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_MIGRATION_NOT_APPLIED' USING ERRCODE = '55000';
  END IF;
  FOR _row IN SELECT * FROM (VALUES
      ('e3f93688-01ea-4844-ae96-b6219d2bad17'::uuid, '02079600-8ac0-4141-aea8-d30daeb807fd'::uuid, 9,
       'd1851c49-820a-426b-86c6-0ea4623b4f41'::uuid, '2026-10-14 05:21:07.701534+00'::timestamptz),
      ('4b5e3530-0f7b-49f6-af8a-68ab2470f3f0'::uuid, '4a3a2f84-84b9-4bdf-af62-935064766a72'::uuid, 10,
       'e3f93688-01ea-4844-ae96-b6219d2bad17'::uuid, '2026-10-14 05:39:11.416473+00'::timestamptz)
    ) AS v(job_id, upload_id, attempt_number, supersedes, created_at)
  LOOP
    IF EXISTS (SELECT 1 FROM public.h3e_attempt_authorizations x WHERE x.job_id = _row.job_id) THEN
      RAISE NOTICE 'H3E_ATTEMPT_AUTHORIZATION_ALREADY_RECORDED %', _row.job_id;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.demo_jobs j
                   WHERE j.id = _row.job_id AND j.upload_id = _row.upload_id
                     AND j.attempt_number = _row.attempt_number AND j.demo_sha256 = _sha
                     AND j.supersedes_job_id = _row.supersedes AND j.created_at = _row.created_at
                     AND j.replacement_reason IS DISTINCT FROM 'g6r-real-demo-replay') THEN
      RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_TARGET_CHANGED %', _row.job_id USING ERRCODE = '55000';
    END IF;
    INSERT INTO public.h3e_attempt_authorizations (job_id, upload_id, attempt_number, demo_sha256, decision_ref,
                                                   authorized_by, evidence)
    VALUES (_row.job_id, _row.upload_id, _row.attempt_number, _sha, _decision, 'owner-confirmed operator step',
            jsonb_build_object('supersedes_job_id', _row.supersedes, 'job_created_at', _row.created_at,
                               'observed_read_only', '2026-10-14'));
    RAISE NOTICE 'H3E_ATTEMPT_AUTHORIZATION_RECORDED %', _row.job_id;
  END LOOP;
END;
$authorize$;
