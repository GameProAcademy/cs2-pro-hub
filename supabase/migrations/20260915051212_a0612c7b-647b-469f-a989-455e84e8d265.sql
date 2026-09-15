CREATE OR REPLACE FUNCTION public.fail_demo_parse_message(
  _job_id uuid,
  _message_id bigint,
  _attempt integer,
  _worker_id text,
  _error_code text,
  _error_message text,
  _permanent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _retry boolean;
  _next_status public.upload_status;
BEGIN
  SELECT * INTO _job
  FROM public.demo_jobs j
  WHERE j.id = _job_id
    AND j.queue_message_id = _message_id
    AND j.dispatch_attempt = _attempt
    AND j.worker_id = _worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'claim_not_current');
  END IF;

  IF _job.status IN ('cancel_requested', 'cancelled') THEN
    PERFORM pgmq.archive('demo_parse', _message_id);
    IF _job.status = 'cancel_requested' THEN
      UPDATE public.demo_jobs SET
        status = 'cancelled', stage = 'cancelled', cancelled_at = COALESCE(cancelled_at, now()),
        finished_at = COALESCE(finished_at, now()), heartbeat_at = NULL,
        lease_expires_at = NULL, worker_id = NULL, error_code = NULL, error_message = NULL,
        updated_at = now()
      WHERE id = _job_id;
      UPDATE public.uploads SET status = 'cancelled', error_code = NULL, error_message = NULL
      WHERE id = _job.upload_id;
    END IF;
    RETURN jsonb_build_object('accepted', true, 'status', 'cancelled', 'retry', false);
  END IF;

  IF _job.status <> 'processing' THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'job_not_processing');
  END IF;
  IF _job.lease_expires_at IS NULL OR _job.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'lease_expired');
  END IF;

  _retry := NOT COALESCE(_permanent, false) AND _job.retry_count < _job.max_retries;
  _next_status := CASE WHEN _retry THEN 'pending'::public.upload_status ELSE 'failed'::public.upload_status END;

  PERFORM pgmq.archive('demo_parse', _message_id);

  UPDATE public.demo_jobs SET
    status = _next_status,
    stage = CASE WHEN _retry THEN 'queued' ELSE 'failed' END,
    retry_count = retry_count + 1,
    queued_at = CASE WHEN _retry THEN now() ELSE queued_at END,
    started_at = CASE WHEN _retry THEN NULL ELSE started_at END,
    heartbeat_at = NULL,
    lease_expires_at = NULL,
    worker_id = NULL,
    finished_at = CASE WHEN _retry THEN NULL ELSE now() END,
    error_code = left(COALESCE(NULLIF(_error_code, ''), 'PARSER_ERROR'), 80),
    error_message = left(NULLIF(_error_message, ''), 500),
    updated_at = now()
  WHERE id = _job_id;

  UPDATE public.uploads SET
    status = _next_status,
    processed_at = NULL,
    processing_duration_ms = NULL,
    error_code = left(COALESCE(NULLIF(_error_code, ''), 'PARSER_ERROR'), 80),
    error_message = left(NULLIF(_error_message, ''), 500)
  WHERE id = _job.upload_id;

  RETURN jsonb_build_object('accepted', true, 'status', _next_status::text, 'retry', _retry);
END;
$$;
REVOKE ALL ON FUNCTION public.fail_demo_parse_message(uuid, bigint, integer, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_demo_parse_message(uuid, bigint, integer, text, text, text, boolean) TO service_role;