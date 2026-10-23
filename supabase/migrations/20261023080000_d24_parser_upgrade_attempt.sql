-- D24 (2026-10-23): reprocessing a demo after a parser release is a NEW attempt, never a requeue.
--
-- Production defect (Mirage job 921b55cf, 2026-10-23 06:51Z): the job was processed by parser
-- git:a5d8c425... and owns that execution's RAW evidence artifact (raw_evidence_artifacts is
-- unique per job_id and immutable once ready). After the R5.8.16 parser release (git:4716f894...)
-- an identity re-run requeued the SAME job; the new parse could never match the immutable
-- manifest of the old parser and failed permanently with PARSER_INVALID_RESPONSE
-- "RAW manifest mismatch" (recorded by D21, dispatch 6, permanent=true). A processed demo was
-- turned into a failed one, and a re-upload of a processed demo only returns "duplicate".
--
-- Change (forward-only, additive):
--   * replacement_reason accepts 'parser_upgrade' on uploads and demo_jobs (same list otherwise,
--     the controlled-replay attempt-9 constraints are untouched);
--   * public.reserve_demo_parser_upgrade_attempt: reserves attempt N+1 for the caller's LATEST
--     attempt of a demo when that attempt was produced by a parser other than the one the app
--     currently pins (passed by the trusted server). The prior job keeps its status, match, RAW
--     artifact and history; enqueue_demo_job links it through superseded_by_job_id as for every
--     other replacement. service_role only.
-- Nothing else is changed: reserve_demo_upload, enqueue_demo_job and requeue_demo_job_after_attachment
-- keep their definitions. Rollback: docs/reference/d24/rollback.sql.

BEGIN;

ALTER TABLE public.uploads
  DROP CONSTRAINT IF EXISTS uploads_replacement_reason_check,
  ADD CONSTRAINT uploads_replacement_reason_check CHECK (
    replacement_reason IS NULL OR replacement_reason IN (
      'stale', 'failed', 'cancelled', 'legacy_unvalidated',
      'raw_audit_blocked', 'g6r-real-demo-replay', 'parser_upgrade'
    )
  );

ALTER TABLE public.demo_jobs
  DROP CONSTRAINT IF EXISTS demo_jobs_replacement_reason_check,
  ADD CONSTRAINT demo_jobs_replacement_reason_check CHECK (
    replacement_reason IS NULL OR replacement_reason IN (
      'stale', 'failed', 'cancelled', 'legacy_unvalidated',
      'raw_audit_blocked', 'g6r-real-demo-replay', 'parser_upgrade'
    )
  );

CREATE OR REPLACE FUNCTION public.reserve_demo_parser_upgrade_attempt(
  _user_id uuid,
  _demo_sha256 text,
  _upload_id uuid,
  _file_name text,
  _file_size bigint,
  _expected_parser_revision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _upload public.uploads%ROWTYPE;
  _latest_upload public.uploads%ROWTYPE;
  _attempt_number integer;
  _storage_path text;
BEGIN
  IF _user_id IS NULL OR _upload_id IS NULL THEN
    RAISE EXCEPTION 'PARSER_UPGRADE_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF _demo_sha256 IS NULL OR _demo_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_DEMO_SHA256' USING ERRCODE = '22023';
  END IF;
  IF _expected_parser_revision IS NULL OR _expected_parser_revision !~ '^git:[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'PARSER_UPGRADE_INVALID_REVISION' USING ERRCODE = '22023';
  END IF;

  -- Same lock as reserve_demo_upload / enqueue_demo_job: one decision per user and demo.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _demo_sha256, 0));

  SELECT * INTO _job FROM public.demo_jobs
  WHERE user_id = _user_id AND demo_sha256 = _demo_sha256
  ORDER BY attempt_number DESC, created_at DESC LIMIT 1 FOR UPDATE;
  IF _job.id IS NULL THEN
    RAISE EXCEPTION 'PARSER_UPGRADE_NO_PRIOR_ATTEMPT' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO _latest_upload FROM public.uploads
  WHERE user_id = _user_id AND demo_sha256 = _demo_sha256
  ORDER BY attempt_number DESC, created_at DESC LIMIT 1 FOR UPDATE;

  -- A newer reservation without a job (file not uploaded / not enqueued yet): resume it.
  IF _latest_upload.id IS NOT NULL AND _latest_upload.attempt_number > _job.attempt_number THEN
    IF _latest_upload.status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM public.demo_jobs WHERE upload_id = _latest_upload.id) THEN
      RETURN jsonb_build_object(
        'upload_id', _latest_upload.id,
        'storage_path', COALESCE(_latest_upload.storage_path, _user_id::text || '/' || _latest_upload.id::text || '.dem'),
        'duplicate', true, 'duplicate_status', 'pending', 'job_id', NULL, 'new_attempt', true,
        'attempt_number', _latest_upload.attempt_number,
        'supersedes_job_id', _latest_upload.supersedes_job_id,
        'replacement_reason', _latest_upload.replacement_reason,
        'reservation_status', 'RESUMED');
    END IF;
    RAISE EXCEPTION 'PARSER_UPGRADE_ATTEMPT_CONFLICT' USING ERRCODE = '55000';
  END IF;

  IF _job.status IN ('pending', 'processing', 'cancel_requested') THEN
    RETURN jsonb_build_object(
      'upload_id', _job.upload_id,
      'storage_path', COALESCE(_job.storage_path, _user_id::text || '/' || _job.upload_id::text || '.dem'),
      'duplicate', true, 'duplicate_status', 'pending', 'job_id', _job.id, 'new_attempt', false,
      'attempt_number', _job.attempt_number, 'supersedes_job_id', _job.supersedes_job_id,
      'replacement_reason', NULL, 'reservation_status', 'IN_PROGRESS');
  END IF;

  IF _job.status NOT IN ('processed', 'failed') THEN
    RAISE EXCEPTION 'PARSER_UPGRADE_NOT_APPLICABLE' USING ERRCODE = '55000';
  END IF;
  IF _job.superseded_by_job_id IS NOT NULL THEN
    RAISE EXCEPTION 'ATTEMPT_ALREADY_SUPERSEDED' USING ERRCODE = '55000';
  END IF;

  -- Only an attempt whose evidence was produced by ANOTHER parser qualifies. A job without a
  -- recorded revision qualifies only when it holds a RAW artifact (which pins its parser).
  IF _job.parser_revision IS NOT DISTINCT FROM _expected_parser_revision
     OR (_job.parser_revision IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.raw_evidence_artifacts a WHERE a.job_id = _job.id)) THEN
    IF _job.status = 'processed' THEN
      RETURN jsonb_build_object(
        'upload_id', _job.upload_id,
        'storage_path', COALESCE(_job.storage_path, _user_id::text || '/' || _job.upload_id::text || '.dem'),
        'duplicate', true, 'duplicate_status', 'processed', 'job_id', _job.id, 'new_attempt', false,
        'attempt_number', _job.attempt_number, 'supersedes_job_id', NULL,
        'replacement_reason', NULL, 'reservation_status', 'CURRENT');
    END IF;
    RAISE EXCEPTION 'PARSER_UPGRADE_NOT_APPLICABLE' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO _upload FROM public.uploads WHERE id = _job.upload_id AND user_id = _user_id;
  _attempt_number := GREATEST(COALESCE(_job.attempt_number, 1), COALESCE(_latest_upload.attempt_number, 1)) + 1;
  _storage_path := _user_id::text || '/' || _upload_id::text || '.dem';

  INSERT INTO public.uploads (
    id, user_id, type, source, file_name, file_size, mime_type, demo_sha256,
    storage_path, status, processed_at, error_message,
    attempt_number, supersedes_job_id, replacement_reason
  ) VALUES (
    _upload_id, _user_id, 'demo', 'manual',
    COALESCE(NULLIF(btrim(_file_name), ''), _upload.file_name, 'demo.dem'),
    COALESCE(_file_size, _job.file_size, _upload.file_size),
    'application/octet-stream', _demo_sha256,
    _storage_path, 'pending', NULL, NULL,
    _attempt_number, _job.id, 'parser_upgrade'
  );

  RETURN jsonb_build_object(
    'upload_id', _upload_id, 'storage_path', _storage_path,
    'duplicate', true, 'duplicate_status', NULL, 'job_id', NULL, 'new_attempt', true,
    'attempt_number', _attempt_number, 'supersedes_job_id', _job.id,
    'replacement_reason', 'parser_upgrade', 'reservation_status', 'CREATED',
    'source_job_id', _job.id, 'source_storage_path', _job.storage_path,
    'source_file_size', _job.file_size);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_demo_parser_upgrade_attempt(uuid, text, uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_demo_parser_upgrade_attempt(uuid, text, uuid, text, bigint, text)
  TO service_role;
COMMENT ON FUNCTION public.reserve_demo_parser_upgrade_attempt(uuid, text, uuid, text, bigint, text) IS
  'D24: reserves attempt N+1 when the latest attempt of a demo was produced by a parser other than the pinned one; the prior attempt and its RAW evidence are preserved.';

COMMIT;
