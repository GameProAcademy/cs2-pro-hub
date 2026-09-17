CREATE OR REPLACE FUNCTION public.retry_demo_job(
  _job_id uuid,
  _user_id uuid,
  _allow_permanent boolean DEFAULT false,
  _reason text DEFAULT 'user_retry'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _next_retry integer;
  _permanent_codes constant text[] := ARRAY[
    'DEMO_TOO_LARGE','DEMO_TOO_SMALL','DEMO_EMPTY','INVALID_DEMO_FORMAT',
    'CORRUPTED_DEMO','UNSUPPORTED_DEMO','VALIDATION_ERROR',
    'PLAYER_IDENTITY_UNRESOLVED','CANONICAL_RESOLUTION_CONFLICT',
    'PARSER_PAYLOAD_TOO_LARGE','DEMO_INSUFFICIENT_SAMPLE','RESOURCE_LIMIT',
    'PARSER_CONFIG_ERROR','PARSER_UNAUTHORIZED','PARSER_FORBIDDEN',
    'PARSER_CONTRACT_MISMATCH','PARSER_INVALID_RESPONSE','PARSER_HASH_MISMATCH',
    'PARSER_FILE_SIZE_MISMATCH','PARSER_IDENTITY_MISMATCH','RAW_AUDIT_BLOCKED'
  ];
BEGIN
  IF _reason <> ALL (ARRAY['user_retry','admin_e2e']) THEN
    RAISE EXCEPTION 'RETRY_REASON_INVALID';
  END IF;

  SELECT * INTO _job
  FROM public.demo_jobs
  WHERE id = _job_id AND user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF _job.status <> 'failed' THEN RAISE EXCEPTION 'JOB_NOT_RETRYABLE'; END IF;
  IF _job.storage_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'DEMO_EXPIRED'; END IF;
  IF NOT _allow_permanent AND _job.error_code = ANY (_permanent_codes) THEN
    RAISE EXCEPTION 'JOB_NOT_RETRYABLE';
  END IF;

  _next_retry := _job.retry_count + 1;
  IF NOT _allow_permanent AND _next_retry > _job.max_retries THEN
    RAISE EXCEPTION 'RETRY_LIMIT_REACHED';
  END IF;

  UPDATE public.demo_jobs
  SET status = 'pending', stage = 'queued', retry_count = _next_retry,
      queued_at = now(), started_at = NULL, heartbeat_at = NULL,
      finished_at = NULL, duration_ms = NULL, error_code = NULL,
      error_message = NULL, lease_expires_at = NULL, worker_id = NULL,
      updated_at = now()
  WHERE id = _job.id;

  UPDATE public.uploads
  SET status = 'pending', processed_at = NULL, processing_duration_ms = NULL,
      error_code = NULL, error_message = NULL
  WHERE id = _job.upload_id;

  RETURN jsonb_build_object(
    'queued', true,
    'job_id', _job.id,
    'attempt_number', _job.attempt_number,
    'dispatch_attempt', _next_retry,
    'reason', _reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retry_demo_job(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_demo_job(uuid, uuid, boolean, text) TO service_role;

COMMENT ON FUNCTION public.retry_demo_job(uuid, uuid, boolean, text) IS
  'Transactional same-attempt retry. attempt_number is immutable; retry_count/dispatch_attempt identify durable dispatches.';