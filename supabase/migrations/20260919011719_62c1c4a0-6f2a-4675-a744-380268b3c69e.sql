-- FASE 2.7.2G.5-R-F.2.1 / .2 — SHA input hardening and orphan reservation reconciliation.

-- Preserve the only known invalid orphan's complete original value as auditable
-- error evidence before clearing the invalid key. No row is deleted or reused.
UPDATE public.uploads
SET status = 'failed',
    error_code = 'INVALID_DEMO_SHA256',
    error_message = jsonb_build_object(
      'reason', 'abandoned_invalid_sha_reservation',
      'original_demo_sha256', demo_sha256,
      'original_length', length(demo_sha256),
      'reconciled_at', now()
    )::text,
    demo_sha256 = NULL,
    processed_at = NULL
WHERE id = '5c514921-d32d-4058-9d34-bbb57c361b53'::uuid
  AND status = 'pending'
  AND NOT EXISTS (SELECT 1 FROM public.demo_jobs j WHERE j.upload_id = uploads.id)
  AND demo_sha256 IS NOT NULL
  AND demo_sha256 !~ '^[0-9a-f]{64}$';

ALTER TABLE public.uploads
  ADD CONSTRAINT uploads_demo_sha256_format_check
  CHECK (demo_sha256 IS NULL OR demo_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_demo_sha256_format_check
  CHECK (demo_sha256 IS NULL OR demo_sha256 ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.reserve_demo_upload(
  _user_id uuid,
  _upload_id uuid,
  _file_name text,
  _file_size bigint,
  _demo_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _upload public.uploads%ROWTYPE;
  _job public.demo_jobs%ROWTYPE;
  _processed_job public.demo_jobs%ROWTYPE;
  _storage_path text;
  _replacement_reason text;
  _attempt_number integer := 1;
  _stale boolean := false;
BEGIN
  IF _demo_sha256 IS NULL OR _demo_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_DEMO_SHA256' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _demo_sha256, 0));

  SELECT j.* INTO _processed_job
  FROM public.demo_jobs j
  WHERE j.user_id = _user_id
    AND j.demo_sha256 = _demo_sha256
    AND j.status = 'processed'
    AND EXISTS (
      SELECT 1
      FROM public.raw_demo_evidence_reports r
      WHERE r.job_id = j.id
        AND r.approved_for_canonical = true
        AND r.raw_audit_status = 'APPROVED'
    )
  ORDER BY j.attempt_number DESC, j.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _processed_job.id IS NOT NULL THEN
    SELECT * INTO _upload FROM public.uploads WHERE id = _processed_job.upload_id;
    RETURN jsonb_build_object(
      'upload_id', _upload.id,
      'storage_path', COALESCE(_upload.storage_path, _user_id::text || '/' || _upload.id::text || '.dem'),
      'duplicate', true,
      'duplicate_status', 'processed',
      'job_id', _processed_job.id,
      'new_attempt', false,
      'attempt_number', _processed_job.attempt_number,
      'supersedes_job_id', NULL,
      'replacement_reason', NULL
    );
  END IF;

  SELECT * INTO _upload
  FROM public.uploads
  WHERE user_id = _user_id
    AND demo_sha256 = _demo_sha256
  ORDER BY attempt_number DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _upload.id IS NOT NULL THEN
    SELECT * INTO _job
    FROM public.demo_jobs
    WHERE upload_id = _upload.id
    FOR UPDATE;

    IF _job.id IS NULL THEN
      RETURN jsonb_build_object(
        'upload_id', _upload.id,
        'storage_path', COALESCE(_upload.storage_path, _user_id::text || '/' || _upload.id::text || '.dem'),
        'duplicate', true,
        'duplicate_status', 'pending',
        'job_id', NULL,
        'new_attempt', false,
        'attempt_number', _upload.attempt_number,
        'supersedes_job_id', _upload.supersedes_job_id,
        'replacement_reason', _upload.replacement_reason
      );
    END IF;

    _stale := _job.status = 'processing'
      AND COALESCE(_job.heartbeat_at, _job.started_at) < now() - interval '15 minutes'
      AND (
        (_job.durable_dispatch_enabled AND _job.queue_message_id IS NOT NULL
          AND _job.lease_expires_at IS NOT NULL AND _job.lease_expires_at < now())
        OR
        (NOT _job.durable_dispatch_enabled
          AND (_job.lease_expires_at IS NULL OR _job.lease_expires_at < now()))
      );

    IF _job.status IN ('pending', 'cancel_requested')
       OR (_job.status = 'processing' AND NOT _stale) THEN
      RETURN jsonb_build_object(
        'upload_id', _upload.id,
        'storage_path', COALESCE(_upload.storage_path, _user_id::text || '/' || _upload.id::text || '.dem'),
        'duplicate', true,
        'duplicate_status', 'pending',
        'job_id', _job.id,
        'new_attempt', false,
        'attempt_number', _job.attempt_number,
        'supersedes_job_id', _job.supersedes_job_id,
        'replacement_reason', NULL
      );
    END IF;

    IF _stale THEN
      _replacement_reason := 'stale';
      IF _job.queue_message_id IS NOT NULL THEN
        PERFORM pgmq.archive('demo_parse', _job.queue_message_id);
      END IF;
      UPDATE public.demo_jobs SET
        status = 'failed', stage = 'failed', finished_at = now(),
        error_code = 'JOB_STALE', error_message = NULL,
        lease_expires_at = NULL, heartbeat_at = NULL, worker_id = NULL,
        replacement_reason = 'stale', updated_at = now()
      WHERE id = _job.id;
      UPDATE public.uploads SET
        status = 'failed', processed_at = NULL,
        error_code = 'JOB_STALE', error_message = NULL,
        replacement_reason = 'stale'
      WHERE id = _upload.id;
    ELSIF _job.status = 'failed' OR _upload.status = 'failed' THEN
      _replacement_reason := 'failed';
    ELSIF _job.status = 'cancelled' OR _upload.status = 'cancelled' THEN
      _replacement_reason := 'cancelled';
    ELSIF _job.status = 'blocked_raw_audit' OR _upload.status = 'blocked_raw_audit' THEN
      _replacement_reason := 'raw_audit_blocked';
    ELSIF _job.status = 'processed' OR _upload.status = 'processed' THEN
      _replacement_reason := 'legacy_unvalidated';
    ELSE
      RETURN jsonb_build_object(
        'upload_id', _upload.id,
        'storage_path', COALESCE(_upload.storage_path, _user_id::text || '/' || _upload.id::text || '.dem'),
        'duplicate', true,
        'duplicate_status', 'pending',
        'job_id', _job.id,
        'new_attempt', false,
        'attempt_number', _job.attempt_number,
        'supersedes_job_id', _job.supersedes_job_id,
        'replacement_reason', NULL
      );
    END IF;

    _attempt_number := GREATEST(COALESCE(_job.attempt_number, 1), COALESCE(_upload.attempt_number, 1)) + 1;
  END IF;

  _storage_path := _user_id::text || '/' || _upload_id::text || '.dem';
  INSERT INTO public.uploads (
    id, user_id, type, source, file_name, file_size, mime_type, demo_sha256,
    storage_path, status, processed_at, error_message, attempt_number,
    supersedes_job_id, replacement_reason
  ) VALUES (
    _upload_id, _user_id, 'demo', 'manual', _file_name, _file_size,
    'application/octet-stream', _demo_sha256, _storage_path, 'pending', NULL, NULL,
    _attempt_number, CASE WHEN _job.id IS NOT NULL THEN _job.id ELSE NULL END,
    _replacement_reason
  );

  RETURN jsonb_build_object(
    'upload_id', _upload_id,
    'storage_path', _storage_path,
    'duplicate', _job.id IS NOT NULL,
    'duplicate_status', CASE
      WHEN _replacement_reason = 'cancelled' THEN 'cancelled'
      WHEN _replacement_reason IN ('failed', 'stale', 'raw_audit_blocked') THEN 'failed'
      ELSE NULL
    END,
    'job_id', NULL,
    'new_attempt', _job.id IS NOT NULL,
    'attempt_number', _attempt_number,
    'supersedes_job_id', CASE WHEN _job.id IS NOT NULL THEN _job.id ELSE NULL END,
    'replacement_reason', _replacement_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_demo_job(
  _upload_id uuid,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _upload public.uploads%ROWTYPE;
  _job public.demo_jobs%ROWTYPE;
  _demo_sha256 text;
BEGIN
  SELECT u.demo_sha256 INTO _demo_sha256
  FROM public.uploads u
  WHERE u.id = _upload_id AND u.user_id = _user_id;
  IF _demo_sha256 IS NULL THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND'; END IF;
  IF _demo_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_DEMO_SHA256' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _demo_sha256, 0));

  SELECT * INTO _upload
  FROM public.uploads
  WHERE id = _upload_id AND user_id = _user_id
  FOR UPDATE;
  IF _upload.id IS NULL THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND'; END IF;
  IF _upload.demo_sha256 IS NULL OR _upload.demo_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_DEMO_SHA256' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _job FROM public.demo_jobs WHERE upload_id = _upload.id FOR UPDATE;
  IF _job.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'job_id', _job.id, 'queued', false, 'duplicate', true,
      'status', _job.status, 'attempt_number', _job.attempt_number,
      'supersedes_job_id', _job.supersedes_job_id,
      'replacement_reason', _job.replacement_reason
    );
  END IF;

  IF _upload.status <> 'pending' THEN RAISE EXCEPTION 'UPLOAD_NOT_ENQUEUEABLE'; END IF;

  INSERT INTO public.demo_jobs (
    upload_id, user_id, status, stage, storage_path, demo_sha256, file_size,
    queued_at, started_at, finished_at, error_code, error_message,
    attempt_number, supersedes_job_id, replacement_reason
  ) VALUES (
    _upload.id, _user_id, 'pending', 'queued', _upload.storage_path,
    _upload.demo_sha256, _upload.file_size, now(), NULL, NULL, NULL, NULL,
    _upload.attempt_number, _upload.supersedes_job_id, _upload.replacement_reason
  ) RETURNING * INTO _job;

  IF _job.supersedes_job_id IS NOT NULL THEN
    UPDATE public.demo_jobs SET
      superseded_by_job_id = _job.id,
      replacement_reason = COALESCE(replacement_reason, _job.replacement_reason),
      updated_at = now()
    WHERE id = _job.supersedes_job_id AND superseded_by_job_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTEMPT_ALREADY_SUPERSEDED'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'job_id', _job.id, 'queued', true, 'duplicate', _job.attempt_number > 1,
    'status', 'pending', 'attempt_number', _job.attempt_number,
    'supersedes_job_id', _job.supersedes_job_id,
    'replacement_reason', _job.replacement_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_orphan_demo_uploads(
  _older_than_minutes integer DEFAULT 15,
  _limit integer DEFAULT 25
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _candidate record;
  _upload public.uploads%ROWTYPE;
  _count integer := 0;
BEGIN
  IF COALESCE(_older_than_minutes, 0) < 15 THEN
    RAISE EXCEPTION 'INVALID_ORPHAN_AGE_WINDOW' USING ERRCODE = '22023';
  END IF;

  FOR _candidate IN
    SELECT u.id, u.user_id, u.demo_sha256
    FROM public.uploads u
    WHERE u.status = 'pending'
      AND u.created_at < now() - make_interval(mins => _older_than_minutes)
      AND NOT EXISTS (SELECT 1 FROM public.demo_jobs j WHERE j.upload_id = u.id)
    ORDER BY u.created_at, u.id
    LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 100)
  LOOP
    IF _candidate.demo_sha256 IS NULL OR _candidate.demo_sha256 !~ '^[0-9a-f]{64}$' THEN
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(_candidate.user_id::text || ':' || _candidate.demo_sha256, 0)
    );

    SELECT * INTO _upload
    FROM public.uploads u
    WHERE u.id = _candidate.id
      AND u.status = 'pending'
      AND u.created_at < now() - make_interval(mins => _older_than_minutes)
      AND NOT EXISTS (SELECT 1 FROM public.demo_jobs j WHERE j.upload_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'demos' AND o.name = u.storage_path
      )
    FOR UPDATE;

    IF _upload.id IS NOT NULL THEN
      UPDATE public.uploads
      SET status = 'failed',
          error_code = 'UPLOAD_RESERVATION_ABANDONED',
          error_message = jsonb_build_object(
            'reason', 'pending_without_job_or_storage_object',
            'older_than_minutes', _older_than_minutes,
            'reconciled_at', now()
          )::text,
          processed_at = NULL
      WHERE id = _upload.id;
      _count := _count + 1;
    END IF;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_demo_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_demo_job(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_orphan_demo_uploads(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_orphan_demo_uploads(integer, integer) TO service_role;

COMMENT ON FUNCTION public.reconcile_orphan_demo_uploads(integer, integer) IS
  'Fails old pending demo reservations only when they still have no job and no physical Storage object; serialized by the same owner+SHA advisory lock as reserve/enqueue.';

-- Reconcile only old, verified job-less/object-less reservations. The invalid
-- reservation above is already preserved and terminal, so it is not revisited.
SELECT public.reconcile_orphan_demo_uploads(15, 100);