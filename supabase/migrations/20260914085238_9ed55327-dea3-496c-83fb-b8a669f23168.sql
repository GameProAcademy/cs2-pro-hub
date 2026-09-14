CREATE EXTENSION IF NOT EXISTS pgmq;

SELECT pgmq.create('demo_parse');

REVOKE ALL ON SCHEMA pgmq FROM PUBLIC, anon, authenticated;

ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS dispatch_attempt integer,
  ADD COLUMN IF NOT EXISTS queue_message_id bigint,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_id text;

ALTER TABLE public.demo_jobs
  DROP CONSTRAINT IF EXISTS demo_jobs_dispatch_attempt_check;
ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_dispatch_attempt_check
  CHECK (dispatch_attempt IS NULL OR dispatch_attempt >= 0);

CREATE INDEX IF NOT EXISTS demo_jobs_queue_message_idx
  ON public.demo_jobs (queue_message_id)
  WHERE queue_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS demo_jobs_dispatch_reconcile_idx
  ON public.demo_jobs (status, queued_at)
  WHERE status = 'pending' AND queue_message_id IS NULL;
CREATE INDEX IF NOT EXISTS demo_jobs_live_lease_idx
  ON public.demo_jobs (lease_expires_at)
  WHERE status = 'processing' AND queue_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.dispatch_demo_parse_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _message_id bigint;
BEGIN
  IF NEW.status <> 'pending' THEN
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

DROP TRIGGER IF EXISTS demo_jobs_dispatch_to_pgmq ON public.demo_jobs;
CREATE TRIGGER demo_jobs_dispatch_to_pgmq
BEFORE INSERT OR UPDATE ON public.demo_jobs
FOR EACH ROW EXECUTE FUNCTION public.dispatch_demo_parse_message();

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
    'demo_sha256', _job.demo_sha256,
    'file_size', _job.file_size,
    'storage_path', _job.storage_path,
    'attempt', _attempt,
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

CREATE OR REPLACE FUNCTION public.heartbeat_demo_parse_message(
  _job_id uuid,
  _message_id bigint,
  _attempt integer,
  _worker_id text,
  _visibility_seconds integer DEFAULT 900
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
     SET heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => _visibility),
         updated_at = now()
   WHERE id = _job_id;
  RETURN jsonb_build_object('accepted', true, 'cancelled', false, 'status', 'processing');
END;
$$;
REVOKE ALL ON FUNCTION public.heartbeat_demo_parse_message(uuid, bigint, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_demo_parse_message(uuid, bigint, integer, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_demo_parse_message(
  _job_id uuid,
  _message_id bigint,
  _attempt integer,
  _worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _archived boolean := false;
BEGIN
  SELECT * INTO _job FROM public.demo_jobs j WHERE j.id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'job_not_found');
  END IF;

  IF _attempt > _job.retry_count THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'attempt_not_current');
  END IF;

  SELECT pgmq.archive('demo_parse', _message_id) INTO _archived;

  IF _job.queue_message_id = _message_id AND _job.dispatch_attempt = _attempt THEN
    UPDATE public.demo_jobs
       SET lease_expires_at = NULL,
           worker_id = NULL,
           updated_at = now()
     WHERE id = _job_id;
  END IF;

  RETURN jsonb_build_object(
    'acknowledged', COALESCE(_archived, false),
    'status', _job.status::text,
    'redeliverable', _job.status = 'pending'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_demo_parse_message(uuid, bigint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_demo_parse_message(uuid, bigint, integer, text) TO service_role;