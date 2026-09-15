-- FASE 2.7.2D.3-J follow-up.
--
-- The production database received the final Phase J lock-order / duplicate
-- contract hardening before this migration was committed. Keep the repository
-- migration history aligned with the live functions so a fresh environment
-- reproduces the same behavior.
--
-- Invariants:
-- * reserve and enqueue acquire the same owner+SHA advisory lock before row
--   locking, preventing lock-order deadlocks between concurrent paths;
-- * stale replacement is reported as duplicate_status='failed' while the
--   precise replacement_reason remains 'stale';
-- * only an approved RAW-backed processed attempt is idempotent;
-- * reservation/enqueue remain service-role only.

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
        (
          _job.durable_dispatch_enabled
          AND _job.queue_message_id IS NOT NULL
          AND _job.lease_expires_at IS NOT NULL
          AND _job.lease_expires_at < now()
        )
        OR
        (
          NOT _job.durable_dispatch_enabled
          AND (_job.lease_expires_at IS NULL OR _job.lease_expires_at < now())
        )
      );

    IF _job.status IN ('pending','cancel_requested')
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
        status='failed', stage='failed', finished_at=now(),
        error_code='JOB_STALE', error_message=NULL,
        lease_expires_at=NULL, heartbeat_at=NULL, worker_id=NULL,
        replacement_reason='stale', updated_at=now()
      WHERE id=_job.id;
      UPDATE public.uploads SET
        status='failed', processed_at=NULL,
        error_code='JOB_STALE', error_message=NULL,
        replacement_reason='stale'
      WHERE id=_upload.id;
    ELSIF _job.status='failed' OR _upload.status='failed' THEN
      _replacement_reason := 'failed';
    ELSIF _job.status='cancelled' OR _upload.status='cancelled' THEN
      _replacement_reason := 'cancelled';
    ELSIF _job.status='processed' OR _upload.status='processed' THEN
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

    _attempt_number := GREATEST(COALESCE(_job.attempt_number,1), COALESCE(_upload.attempt_number,1)) + 1;
  END IF;

  _storage_path := _user_id::text || '/' || _upload_id::text || '.dem';
  INSERT INTO public.uploads (
    id,user_id,type,source,file_name,file_size,mime_type,demo_sha256,storage_path,
    status,processed_at,error_message,attempt_number,supersedes_job_id,replacement_reason
  ) VALUES (
    _upload_id,_user_id,'demo','manual',_file_name,_file_size,'application/octet-stream',
    _demo_sha256,_storage_path,'pending',NULL,NULL,_attempt_number,
    CASE WHEN _job.id IS NOT NULL THEN _job.id ELSE NULL END,_replacement_reason
  );

  RETURN jsonb_build_object(
    'upload_id',_upload_id,
    'storage_path',_storage_path,
    'duplicate',_job.id IS NOT NULL,
    'duplicate_status',CASE
      WHEN _replacement_reason='cancelled' THEN 'cancelled'
      WHEN _replacement_reason IN ('failed','stale') THEN 'failed'
      ELSE NULL
    END,
    'job_id',NULL,
    'new_attempt',_job.id IS NOT NULL,
    'attempt_number',_attempt_number,
    'supersedes_job_id',CASE WHEN _job.id IS NOT NULL THEN _job.id ELSE NULL END,
    'replacement_reason',_replacement_reason
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

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _demo_sha256, 0));

  SELECT * INTO _upload
  FROM public.uploads
  WHERE id = _upload_id AND user_id = _user_id
  FOR UPDATE;
  IF _upload.id IS NULL THEN RAISE EXCEPTION 'UPLOAD_NOT_FOUND'; END IF;

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
    upload_id,user_id,status,stage,storage_path,demo_sha256,file_size,
    queued_at,started_at,finished_at,error_code,error_message,
    attempt_number,supersedes_job_id,replacement_reason
  ) VALUES (
    _upload.id,_user_id,'pending','queued',_upload.storage_path,_upload.demo_sha256,_upload.file_size,
    now(),NULL,NULL,NULL,NULL,
    _upload.attempt_number,_upload.supersedes_job_id,_upload.replacement_reason
  ) RETURNING * INTO _job;

  IF _job.supersedes_job_id IS NOT NULL THEN
    UPDATE public.demo_jobs SET
      superseded_by_job_id=_job.id,
      replacement_reason=COALESCE(replacement_reason,_job.replacement_reason),
      updated_at=now()
    WHERE id=_job.supersedes_job_id AND superseded_by_job_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTEMPT_ALREADY_SUPERSEDED'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'job_id',_job.id,'queued',true,'duplicate',_job.attempt_number > 1,
    'status','pending','attempt_number',_job.attempt_number,
    'supersedes_job_id',_job.supersedes_job_id,
    'replacement_reason',_job.replacement_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_demo_upload(uuid, uuid, text, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_demo_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_demo_job(uuid, uuid) TO service_role;
