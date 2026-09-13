CREATE UNIQUE INDEX uploads_user_demo_sha_active_key
  ON public.uploads (user_id, demo_sha256)
  WHERE demo_sha256 IS NOT NULL AND status <> 'cancelled';

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
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _demo_sha256, 0));

  SELECT * INTO _upload
  FROM public.uploads
  WHERE user_id = _user_id
    AND demo_sha256 = _demo_sha256
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _upload.id IS NOT NULL THEN
    SELECT * INTO _job
    FROM public.demo_jobs
    WHERE upload_id = _upload.id
    FOR UPDATE;

    RETURN jsonb_build_object(
      'upload_id', _upload.id,
      'storage_path', COALESCE(_upload.storage_path, _user_id::text || '/' || _upload.id::text || '.dem'),
      'duplicate', true,
      'duplicate_status', CASE
        WHEN _upload.status = 'processed' OR _job.status = 'processed' THEN 'processed'
        WHEN _upload.status = 'failed' OR _job.status = 'failed' THEN 'failed'
        ELSE 'pending'
      END,
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
    IF _job.status IN ('pending', 'processing') THEN
      RETURN jsonb_build_object('job_id', _job.id, 'queued', false, 'duplicate', true, 'status', _job.status);
    END IF;
    IF _job.status = 'processed' OR _upload.status = 'processed' THEN
      RETURN jsonb_build_object('job_id', _job.id, 'queued', false, 'duplicate', true, 'status', 'processed');
    END IF;
    IF _job.status = 'failed' OR _upload.status = 'failed' THEN
      RETURN jsonb_build_object('job_id', _job.id, 'queued', false, 'duplicate', true, 'status', 'failed');
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