CREATE OR REPLACE FUNCTION public.claim_demo_parse_message(
  _worker_id text,
  _visibility_seconds integer DEFAULT 900,
  _max_concurrent integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _message jsonb;
  _job public.demo_jobs%ROWTYPE;
  _message_id bigint;
  _attempt integer;
  _job_id uuid;
  _busy integer;
  _visibility integer := LEAST(GREATEST(COALESCE(_visibility_seconds, 900), 60), 3600);
BEGIN
  IF _worker_id IS NULL OR length(btrim(_worker_id)) < 3 OR length(_worker_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_WORKER_ID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.claim_demo_parse_message'));
  SELECT count(*) INTO _busy
  FROM public.demo_jobs j
  WHERE j.status = 'processing'
    AND j.queue_message_id IS NOT NULL
    AND j.lease_expires_at > now();
  IF _busy >= LEAST(GREATEST(COALESCE(_max_concurrent, 1), 1), 8) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;

  SELECT to_jsonb(m) INTO _message
  FROM pgmq.read('demo_parse', _visibility, 1) AS m
  LIMIT 1;
  IF _message IS NULL THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;

  _message_id := (_message->>'msg_id')::bigint;
  _job_id := (_message->'message'->>'job_id')::uuid;
  _attempt := (_message->'message'->>'attempt')::integer;

  SELECT * INTO _job
  FROM public.demo_jobs j
  WHERE j.id = _job_id
  FOR UPDATE;

  IF NOT FOUND
     OR _job.upload_id::text IS DISTINCT FROM (_message->'message'->>'upload_id')
     OR _job.demo_sha256 IS DISTINCT FROM (_message->'message'->>'demo_sha256')
     OR _job.dispatch_attempt IS DISTINCT FROM _attempt
     OR _job.queue_message_id IS DISTINCT FROM _message_id THEN
    PERFORM pgmq.archive('demo_parse', _message_id);
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'stale_or_invalid_message');
  END IF;

  IF _job.status IN ('processed', 'failed', 'cancelled', 'cancel_requested') THEN
    PERFORM pgmq.archive('demo_parse', _message_id);
    RETURN jsonb_build_object('status', 'rejected', 'reason', _job.status::text);
  END IF;

  IF _job.status = 'processing'
     AND _job.lease_expires_at IS NOT NULL
     AND _job.lease_expires_at > now() THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;

  IF _job.status NOT IN ('pending', 'processing') OR _job.retry_count <> _attempt THEN
    PERFORM pgmq.archive('demo_parse', _message_id);
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'ineligible_job');
  END IF;

  UPDATE public.demo_jobs
     SET status = 'processing',
         stage = 'validating',
         started_at = COALESCE(started_at, now()),
         heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => _visibility),
         worker_id = _worker_id,
         finished_at = NULL,
         duration_ms = NULL,
         error_code = NULL,
         error_message = NULL,
         updated_at = now()
   WHERE id = _job.id;

  UPDATE public.uploads SET status = 'processing' WHERE id = _job.upload_id;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'message_id', _message_id,
    'job_id', _job.id,
    'upload_id', _job.upload_id,
    'user_id', _job.user_id,
    'demo_sha256', _job.demo_sha256,
    'file_size', _job.file_size,
    'storage_path', _job.storage_path,
    'attempt', _attempt,
    'attempt_number', _job.attempt_number,
    'schema_version', 1,
    'requested_at', _message->'message'->>'requested_at'
  );
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    IF _message_id IS NOT NULL THEN
      PERFORM pgmq.archive('demo_parse', _message_id);
    END IF;
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'malformed_message');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_demo_parse_message(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_parse_message(text, integer, integer) TO service_role;