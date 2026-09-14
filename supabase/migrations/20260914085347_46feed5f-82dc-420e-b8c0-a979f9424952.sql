ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS durable_dispatch_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.dispatch_demo_parse_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _message_id bigint;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    NEW.durable_dispatch_enabled := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'pending' AND OLD.status IS DISTINCT FROM 'pending' THEN
    NEW.durable_dispatch_enabled := true;
  END IF;

  IF NEW.status <> 'pending' OR NOT NEW.durable_dispatch_enabled THEN
    IF NEW.status IN ('processed', 'failed', 'cancel_requested', 'cancelled') THEN
      NEW.lease_expires_at := NULL;
      NEW.worker_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'pending'
     AND OLD.retry_count = NEW.retry_count
     AND OLD.queue_message_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT pgmq.send(
    queue_name => 'demo_parse',
    msg => jsonb_build_object(
      'job_id', NEW.id,
      'upload_id', NEW.upload_id,
      'demo_sha256', NEW.demo_sha256,
      'attempt', NEW.retry_count,
      'schema_version', 1,
      'requested_at', now()
    )
  ) INTO _message_id;

  NEW.dispatch_attempt := NEW.retry_count;
  NEW.queue_message_id := _message_id;
  NEW.dispatched_at := now();
  NEW.lease_expires_at := NULL;
  NEW.worker_id := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_demo_parse_message() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_demo_parse_queue(_limit integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _count integer;
BEGIN
  WITH candidates AS (
    SELECT j.id
    FROM public.demo_jobs j
    WHERE j.status = 'pending'
      AND j.durable_dispatch_enabled
      AND j.queue_message_id IS NULL
    ORDER BY j.queued_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 100)
  ), touched AS (
    UPDATE public.demo_jobs j
       SET updated_at = now()
      FROM candidates c
     WHERE j.id = c.id
     RETURNING j.id
  )
  SELECT count(*)::integer INTO _count FROM touched;
  RETURN COALESCE(_count, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_demo_parse_queue(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_demo_parse_queue(integer) TO service_role;

DROP FUNCTION IF EXISTS public.heartbeat_demo_parse_message(uuid, bigint, integer, text, integer);
CREATE OR REPLACE FUNCTION public.heartbeat_demo_parse_message(
  _job_id uuid,
  _message_id bigint,
  _attempt integer,
  _worker_id text,
  _visibility_seconds integer DEFAULT 900,
  _stage text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _status public.upload_status;
  _visibility integer := LEAST(GREATEST(COALESCE(_visibility_seconds, 900), 60), 3600);
BEGIN
  IF _stage IS NOT NULL AND _stage NOT IN ('validating', 'parsing', 'normalizing', 'metrics', 'persisting', 'cleanup') THEN
    RAISE EXCEPTION 'INVALID_STAGE' USING ERRCODE = '22023';
  END IF;

  SELECT j.status INTO _status
  FROM public.demo_jobs j
  WHERE j.id = _job_id
    AND j.queue_message_id = _message_id
    AND j.dispatch_attempt = _attempt
    AND j.worker_id = _worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false, 'cancelled', false, 'reason', 'claim_not_current');
  END IF;
  IF _status IN ('cancel_requested', 'cancelled') THEN
    RETURN jsonb_build_object('accepted', true, 'cancelled', true, 'status', _status::text);
  END IF;
  IF _status <> 'processing' THEN
    RETURN jsonb_build_object('accepted', false, 'cancelled', false, 'status', _status::text);
  END IF;

  PERFORM pgmq.set_vt('demo_parse', _message_id, _visibility);
  UPDATE public.demo_jobs
     SET stage = COALESCE(_stage, stage),
         heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => _visibility),
         updated_at = now()
   WHERE id = _job_id;
  RETURN jsonb_build_object('accepted', true, 'cancelled', false, 'status', 'processing');
END;
$$;
REVOKE ALL ON FUNCTION public.heartbeat_demo_parse_message(uuid, bigint, integer, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_demo_parse_message(uuid, bigint, integer, text, integer, text) TO service_role;

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

CREATE OR REPLACE FUNCTION public.recover_stale_demo_jobs(_stale_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _count integer;
BEGIN
  WITH stale AS (
    SELECT id, upload_id, retry_count, max_retries
    FROM public.demo_jobs
    WHERE status = 'processing'
      AND durable_dispatch_enabled
      AND queue_message_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < now()
      AND COALESCE(heartbeat_at, started_at) < now() - make_interval(mins => GREATEST(COALESCE(_stale_minutes, 15), 1))
    FOR UPDATE SKIP LOCKED
  ), recovered AS (
    UPDATE public.demo_jobs j SET
      status = CASE WHEN s.retry_count < s.max_retries THEN 'pending'::public.upload_status ELSE 'failed'::public.upload_status END,
      stage = CASE WHEN s.retry_count < s.max_retries THEN 'queued' ELSE 'failed' END,
      retry_count = s.retry_count + 1,
      queued_at = CASE WHEN s.retry_count < s.max_retries THEN now() ELSE queued_at END,
      started_at = NULL, heartbeat_at = NULL, lease_expires_at = NULL, worker_id = NULL,
      finished_at = CASE WHEN s.retry_count < s.max_retries THEN NULL ELSE now() END,
      duration_ms = NULL,
      error_code = CASE WHEN s.retry_count < s.max_retries THEN NULL ELSE 'JOB_STALE' END,
      error_message = NULL, updated_at = now()
    FROM stale s WHERE j.id = s.id RETURNING j.upload_id, j.status
  )
  UPDATE public.uploads u SET status = r.status, processed_at = NULL, processing_duration_ms = NULL,
    error_code = CASE WHEN r.status = 'failed' THEN 'JOB_STALE' ELSE NULL END, error_message = NULL
  FROM recovered r WHERE u.id = r.upload_id;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_stale_demo_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_demo_jobs(integer) TO service_role;