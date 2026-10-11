-- Demo-parse queue: recovery protocol for a dispatch whose holder never reported.
--
-- NOT applied to any real environment by this change. Exercised only on a
-- disposable database (scripts/queue/recovery_protocol_probe.py).
--
-- Vocabulary (kept apart on purpose):
--   job        one demo_jobs row; identity is (id, upload_id, attempt_number)
--   dispatch   one queue message for the job; identity is (retry_count, msg_id)
--   delivery   one lease granted on a dispatch (a successful claim)
--   execution  one parser run, recorded in the H3E91 ledger
-- pgmq.read_ct counts reads, including reads answered 'busy'. It is neither a
-- delivery count nor an execution count and is not used here.
--
-- What changes:
--   1. demo_jobs.delivery_count counts leases granted for the current dispatch.
--   2. A redelivery (lease expired, same dispatch) is still granted, so the
--      worker can reconcile it against the execution ledger, but it does not
--      refresh heartbeat_at: a heartbeat means worker progress, not a claim.
--   3. abandon_demo_parse_dispatch closes a redelivered dispatch whose ledger
--      shows an execution that left no usable result: it began and never
--      reached a terminal, or it FINISHED but its completion never committed
--      (the job is still 'processing'). The job gets a NEW dispatch (counted
--      retry) while retries remain, otherwise an explicit terminal JOB_STALE.
--   4. A dispatch is delivered at most 3 times. A fourth delivery is refused and
--      the job ends in a terminal JOB_STALE: reconciliation was attempted twice
--      and could not decide, so nothing is retried automatically.
--   5. Every closure is written to demo_job_dispatch_closures (service only).

ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS delivery_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.demo_job_dispatch_closures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.demo_jobs(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL,
  dispatch_attempt integer NOT NULL,
  queue_message_id bigint,
  delivery_count integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('abandoned_execution', 'delivery_limit', 'stale_sweep')),
  lifecycle text CHECK (lifecycle IS NULL OR lifecycle IN ('INTENT_ONLY', 'STARTED', 'FINISHED')),
  retried boolean NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, dispatch_attempt)
);
ALTER TABLE public.demo_job_dispatch_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demo_job_dispatch_closures FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.demo_job_dispatch_closures TO service_role;

-- One place that closes a dispatch nobody will report on.
CREATE OR REPLACE FUNCTION public.close_demo_parse_dispatch(
  _job_id uuid,
  _reason text,
  _lifecycle text,
  _allow_retry boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _retry boolean;
  _detail text;
BEGIN
  SELECT * INTO _job FROM public.demo_jobs j WHERE j.id = _job_id FOR UPDATE;
  IF NOT FOUND OR _job.status <> 'processing' THEN
    RAISE EXCEPTION 'DISPATCH_NOT_OPEN' USING ERRCODE = '22023';
  END IF;

  _retry := COALESCE(_allow_retry, false) AND _job.retry_count < _job.max_retries;
  _detail := left(format('dispatch %s closed: %s%s after %s deliveries',
    _job.dispatch_attempt, _reason,
    CASE WHEN _lifecycle IS NULL THEN '' ELSE ' at ' || _lifecycle END,
    _job.delivery_count), 500);

  IF _job.queue_message_id IS NOT NULL THEN
    PERFORM pgmq.archive('demo_parse', _job.queue_message_id);
  END IF;

  INSERT INTO public.demo_job_dispatch_closures(
    job_id, upload_id, dispatch_attempt, queue_message_id, delivery_count, reason, lifecycle, retried
  ) VALUES (
    _job.id, _job.upload_id, _job.dispatch_attempt, _job.queue_message_id,
    _job.delivery_count, _reason, _lifecycle, _retry
  );

  UPDATE public.demo_jobs SET
    status = CASE WHEN _retry THEN 'pending'::public.upload_status ELSE 'failed'::public.upload_status END,
    stage = CASE WHEN _retry THEN 'queued' ELSE 'failed' END,
    retry_count = retry_count + 1,
    queued_at = CASE WHEN _retry THEN now() ELSE queued_at END,
    started_at = NULL, heartbeat_at = NULL, lease_expires_at = NULL, worker_id = NULL,
    finished_at = CASE WHEN _retry THEN NULL ELSE now() END,
    duration_ms = NULL,
    error_code = CASE WHEN _retry THEN NULL ELSE 'JOB_STALE' END,
    error_message = CASE WHEN _retry THEN NULL ELSE _detail END,
    updated_at = now()
  WHERE id = _job.id;

  UPDATE public.uploads SET
    status = CASE WHEN _retry THEN 'pending'::public.upload_status ELSE 'failed'::public.upload_status END,
    processed_at = NULL, processing_duration_ms = NULL,
    error_code = CASE WHEN _retry THEN NULL ELSE 'JOB_STALE' END,
    error_message = CASE WHEN _retry THEN NULL ELSE _detail END
  WHERE id = _job.upload_id;

  RETURN _retry;
END;
$$;
REVOKE ALL ON FUNCTION public.close_demo_parse_dispatch(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- A new dispatch starts with no deliveries.
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
    IF NEW.status IN ('failed', 'cancel_requested', 'cancelled') THEN
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
  NEW.delivery_count := 0;
  RETURN NEW;
END;
$$;

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
  _redelivery boolean;
  -- Leases granted for ONE dispatch: the original, and two to reconcile it.
  _max_deliveries CONSTANT integer := 3;
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

  -- Same dispatch, lease expired: the previous holder never reported.
  _redelivery := _job.status = 'processing';

  IF _redelivery AND _job.delivery_count >= _max_deliveries THEN
    -- Reconciliation had its chances and did not decide. The ledger state is
    -- unknown here, so nothing is retried automatically.
    PERFORM public.close_demo_parse_dispatch(_job.id, 'delivery_limit', NULL, false);
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'delivery_limit', 'retry', false);
  END IF;

  UPDATE public.demo_jobs
     SET status = 'processing',
         stage = CASE WHEN _redelivery THEN stage ELSE 'validating' END,
         started_at = COALESCE(started_at, now()),
         -- A heartbeat is worker progress. A redelivery is not progress.
         heartbeat_at = CASE WHEN _redelivery THEN heartbeat_at ELSE now() END,
         lease_expires_at = now() + make_interval(secs => _visibility),
         worker_id = _worker_id,
         delivery_count = delivery_count + 1,
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
    'delivery', _job.delivery_count + 1,
    'redelivery', _redelivery,
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

-- Called by the current lease holder of a REDELIVERED dispatch after it read
-- the execution ledger and found an execution with no usable result (see 3).
-- The first holder of a dispatch can never use this: it owns the execution and
-- must record a terminal and report fail/complete.
CREATE OR REPLACE FUNCTION public.abandon_demo_parse_dispatch(
  _job_id uuid,
  _message_id bigint,
  _attempt integer,
  _worker_id text,
  _lifecycle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _retry boolean;
BEGIN
  IF _lifecycle IS NULL OR _lifecycle NOT IN ('INTENT_ONLY', 'STARTED', 'FINISHED') THEN
    RAISE EXCEPTION 'INVALID_LIFECYCLE' USING ERRCODE = '22023';
  END IF;

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
    RETURN jsonb_build_object('accepted', false, 'reason', 'cancellation_pending');
  END IF;
  IF _job.status <> 'processing' THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'job_not_processing');
  END IF;
  IF _job.lease_expires_at IS NULL OR _job.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'lease_expired');
  END IF;
  IF _job.delivery_count < 2 THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'not_a_redelivery');
  END IF;

  _retry := public.close_demo_parse_dispatch(_job.id, 'abandoned_execution', _lifecycle, true);
  RETURN jsonb_build_object(
    'accepted', true,
    'status', CASE WHEN _retry THEN 'pending' ELSE 'failed' END,
    'retry', _retry
  );
END;
$$;
REVOKE ALL ON FUNCTION public.abandon_demo_parse_dispatch(uuid, bigint, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_demo_parse_dispatch(uuid, bigint, integer, text, text) TO service_role;

-- Backstop for when no worker is alive to reconcile. Same selection as before;
-- the closure is now recorded.
CREATE OR REPLACE FUNCTION public.recover_stale_demo_jobs(_stale_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id uuid;
  _count integer := 0;
BEGIN
  FOR _id IN
    SELECT id
    FROM public.demo_jobs
    WHERE status = 'processing'
      AND durable_dispatch_enabled
      AND queue_message_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < now()
      AND COALESCE(heartbeat_at, started_at) < now() - make_interval(mins => GREATEST(COALESCE(_stale_minutes, 15), 1))
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.close_demo_parse_dispatch(_id, 'stale_sweep', NULL, true);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_stale_demo_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_demo_jobs(integer) TO service_role;
