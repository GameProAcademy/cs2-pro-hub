-- FASE 2.7.2D — deterministic duplicate-demo retry semantics.
-- Reuse the same upload/job for FAILED or CANCELLED demos; never create a
-- second active upload for the same user + SHA-256. PROCESSED remains blocked.

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
  _storage_path text;
  _duplicate_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _demo_sha256, 0));

  -- Include cancelled uploads deliberately: cancellation is a terminal state
  -- for the previous attempt, not a ban on re-uploading the same bytes.
  SELECT * INTO _upload
  FROM public.uploads
  WHERE user_id = _user_id
    AND demo_sha256 = _demo_sha256
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _upload.id IS NOT NULL THEN
    SELECT * INTO _job
    FROM public.demo_jobs
    WHERE upload_id = _upload.id
    FOR UPDATE;

    IF _upload.status = 'processed' OR _job.status = 'processed' THEN
      _duplicate_status := 'processed';
    ELSIF _upload.status = 'failed' OR _job.status = 'failed' THEN
      _duplicate_status := 'failed';
    ELSIF _upload.status = 'cancelled' OR _job.status = 'cancelled' THEN
      _duplicate_status := 'cancelled';
    ELSE
      _duplicate_status := 'pending';
    END IF;

    RETURN jsonb_build_object(
      'upload_id', _upload.id,
      'storage_path', COALESCE(_upload.storage_path, _user_id::text || '/' || _upload.id::text || '.dem'),
      'duplicate', true,
      'duplicate_status', _duplicate_status,
      'job_id', _job.id
    );
  END IF;

  _storage_path := _user_id::text || '/' || _upload_id::text || '.dem';
  INSERT INTO public.uploads (
    id, user_id, type, source, file_name, file_size, mime_type,
    demo_sha256, storage_path, status, processed_at, error_message
  ) VALUES (
    _upload_id, _user_id, 'demo', 'manual', _file_name, _file_size,
    'application/octet-stream', _demo_sha256, _storage_path,
    'pending', NULL, NULL
  );

  RETURN jsonb_build_object(
    'upload_id', _upload_id,
    'storage_path', _storage_path,
    'duplicate', false,
    'duplicate_status', NULL,
    'job_id', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) TO service_role;

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
BEGIN
  SELECT * INTO _upload
  FROM public.uploads
  WHERE id = _upload_id AND user_id = _user_id
  FOR UPDATE;

  IF _upload.id IS NULL THEN
    RAISE EXCEPTION 'UPLOAD_NOT_FOUND';
  END IF;

  SELECT * INTO _job
  FROM public.demo_jobs
  WHERE upload_id = _upload.id
  FOR UPDATE;

  IF _job.id IS NOT NULL THEN
    IF _job.status IN ('pending', 'processing', 'cancel_requested') THEN
      RETURN jsonb_build_object('job_id', _job.id, 'queued', false, 'duplicate', true, 'status', _job.status);
    END IF;

    IF _job.status = 'processed' OR _upload.status = 'processed' THEN
      RETURN jsonb_build_object('job_id', _job.id, 'queued', false, 'duplicate', true, 'status', 'processed');
    END IF;

    -- A failed/cancelled attempt may be safely reused after the browser has
    -- replaced the object at the deterministic storage path. Reset the same
    -- job instead of creating another job row.
    IF _job.status IN ('failed', 'cancelled') THEN
      UPDATE public.demo_jobs SET
        status = 'pending', stage = 'queued', retry_count = 0,
        started_at = NULL, heartbeat_at = NULL, finished_at = NULL,
        duration_ms = NULL, error_code = NULL, error_message = NULL,
        cancel_requested_at = NULL, cancelled_at = NULL, cancelled_by = NULL,
        storage_deleted_at = NULL, cleanup_error = NULL, updated_at = now()
      WHERE id = _job.id;

      UPDATE public.uploads SET
        status = 'pending', processed_at = NULL,
        processing_duration_ms = NULL, error_code = NULL, error_message = NULL
      WHERE id = _upload.id;

      RETURN jsonb_build_object('job_id', _job.id, 'queued', true, 'duplicate', true, 'status', 'pending');
    END IF;

    RAISE EXCEPTION 'JOB_NOT_ENQUEUEABLE';
  END IF;

  IF _upload.status <> 'pending' THEN
    RAISE EXCEPTION 'UPLOAD_NOT_ENQUEUEABLE';
  END IF;

  INSERT INTO public.demo_jobs (
    upload_id, user_id, status, stage, storage_path, demo_sha256,
    file_size, queued_at, started_at, finished_at, error_code, error_message
  ) VALUES (
    _upload.id, _user_id, 'pending', 'queued', _upload.storage_path,
    _upload.demo_sha256, _upload.file_size, now(), NULL, NULL, NULL, NULL
  ) RETURNING * INTO _job;

  RETURN jsonb_build_object('job_id', _job.id, 'queued', true, 'duplicate', false, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_demo_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_demo_job(uuid, uuid) TO service_role;