-- H.3-E operator step (NOT a migration): record the owner's authorization of job 2dc1ddd1
-- (attempt 11 of the reference DEM), observed read-only on the managed database on 2026-10-20.
--
-- Owner decision (chat, 2026-10-20T01:39-03:00): "Autorizo 2dc1ddd1 — a tentativa 11 foi minha/foi
-- autorizada como teste. Registre a autorização de forma auditável, sem alterar retroativamente o
-- resultado JOB_STALE nem inventar eventos de parser."
--
-- Same contract as docs/ops/h3e_attempt_authorizations_2026-10-14.sql: every identity observed
-- read-only is asserted first (including the JOB_STALE outcome and the absence of H3E91 ledger
-- events); any difference aborts with no write. The only write is one row in the append-only
-- registry public.h3e_attempt_authorizations. The job, its outcome and the ledger are not touched.
-- Re-running after success is a no-op.
DO $authorize$
DECLARE
  _decision constant text := 'OWNER-CONFIRMATION 2026-10-20T01:39-03:00 (chat): owner confirms job 2dc1ddd1 (attempt 11, reference DEM 0caa7c97) was started by the owner / authorized as a test. Job outcome failed/JOB_STALE unchanged; no parser event recorded or invented.';
  _job constant uuid := '2dc1ddd1-1799-430e-b511-5cc1ebe25390';
  _upload constant uuid := '989288d2-c355-4b7a-a075-4602efc2e39d';
  _supersedes constant uuid := '4b5e3530-0f7b-49f6-af8a-68ab2470f3f0';
  _created constant timestamptz := '2026-10-16 10:57:12.147991+00';
  _sha constant text := '0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d';
  _ledger_events bigint;
BEGIN
  IF pg_catalog.to_regclass('public.h3e_attempt_authorizations') IS NULL THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_MIGRATION_NOT_APPLIED' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.h3e_attempt_authorizations x WHERE x.job_id = _job) THEN
    RAISE NOTICE 'H3E_ATTEMPT_AUTHORIZATION_ALREADY_RECORDED %', _job;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.demo_jobs j
                 WHERE j.id = _job AND j.upload_id = _upload AND j.attempt_number = 11
                   AND j.demo_sha256 = _sha AND j.supersedes_job_id = _supersedes
                   AND j.created_at = _created AND j.status = 'failed' AND j.error_code = 'JOB_STALE'
                   AND j.replacement_reason = 'raw_audit_blocked') THEN
    RAISE EXCEPTION 'H3E_ATTEMPT_AUTHORIZATION_TARGET_CHANGED %', _job USING ERRCODE = '55000';
  END IF;
  SELECT count(*) INTO _ledger_events FROM public.h3e91_execution_evidence_ledger l WHERE l.job_id = _job;
  INSERT INTO public.h3e_attempt_authorizations (job_id, upload_id, attempt_number, demo_sha256, decision_ref,
                                                 authorized_by, evidence)
  VALUES (_job, _upload, 11, _sha, _decision, 'owner-confirmed operator step',
          jsonb_build_object('supersedes_job_id', _supersedes, 'job_created_at', _created,
                             'observed_read_only', '2026-10-20', 'job_status', 'failed',
                             'job_error_code', 'JOB_STALE', 'h3e91_ledger_events_at_authorization', _ledger_events));
  RAISE NOTICE 'H3E_ATTEMPT_AUTHORIZATION_RECORDED % ledger_events=%', _job, _ledger_events;
END;
$authorize$;
