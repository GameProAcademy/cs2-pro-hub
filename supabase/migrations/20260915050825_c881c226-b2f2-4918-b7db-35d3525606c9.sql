ALTER TYPE public.upload_status ADD VALUE IF NOT EXISTS 'blocked_raw_audit';

ALTER TABLE public.raw_demo_evidence_reports
  ADD COLUMN IF NOT EXISTS forensic_inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_status text NOT NULL DEFAULT 'BLOCKED',
  ADD COLUMN IF NOT EXISTS raw_block_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_for_canonical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS audit_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.raw_demo_evidence_reports
  DROP CONSTRAINT IF EXISTS raw_demo_evidence_reports_raw_status_check;
ALTER TABLE public.raw_demo_evidence_reports
  ADD CONSTRAINT raw_demo_evidence_reports_raw_status_check
  CHECK (raw_status IN ('PASS', 'FAIL', 'BLOCKED'));
ALTER TABLE public.raw_demo_evidence_reports
  DROP CONSTRAINT IF EXISTS raw_demo_evidence_reports_approval_check;
ALTER TABLE public.raw_demo_evidence_reports
  ADD CONSTRAINT raw_demo_evidence_reports_approval_check
  CHECK (
    (approved_for_canonical = false AND approved_at IS NULL AND approved_by IS NULL)
    OR
    (approved_for_canonical = true AND raw_status = 'PASS' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
  );

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
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_demo_parse_message() FROM PUBLIC, anon, authenticated;

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
  _lease_expires_at timestamptz;
  _visibility integer := LEAST(GREATEST(COALESCE(_visibility_seconds, 900), 60), 3600);
BEGIN
  IF _stage IS NOT NULL AND _stage NOT IN ('validating', 'parsing', 'raw_audit', 'normalizing', 'metrics', 'persisting', 'cleanup') THEN
    RAISE EXCEPTION 'INVALID_STAGE' USING ERRCODE = '22023';
  END IF;

  SELECT j.status, j.lease_expires_at INTO _status, _lease_expires_at
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
  IF _lease_expires_at IS NULL OR _lease_expires_at <= now() THEN
    RETURN jsonb_build_object('accepted', false, 'cancelled', false, 'reason', 'lease_expired');
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

CREATE OR REPLACE FUNCTION public.block_demo_job_raw_audit(
  _job_id uuid,
  _message_id bigint,
  _attempt integer,
  _worker_id text,
  _reasons jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
BEGIN
  SELECT * INTO _job
  FROM public.demo_jobs j
  WHERE j.id = _job_id
    AND j.queue_message_id = _message_id
    AND j.dispatch_attempt = _attempt
    AND j.worker_id = _worker_id
    AND j.status = 'processing'
    AND j.lease_expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'claim_not_current_or_expired');
  END IF;

  UPDATE public.demo_jobs SET
    status = 'blocked_raw_audit', stage = 'raw_audit', heartbeat_at = now(),
    error_code = 'RAW_AUDIT_BLOCKED', error_message = left(COALESCE(_reasons::text, '[]'), 500),
    finished_at = now(), updated_at = now()
  WHERE id = _job_id;
  UPDATE public.uploads SET
    status = 'blocked_raw_audit', error_code = 'RAW_AUDIT_BLOCKED',
    error_message = left(COALESCE(_reasons::text, '[]'), 500)
  WHERE id = _job.upload_id;

  RETURN jsonb_build_object('accepted', true, 'status', 'blocked_raw_audit', 'retry', false);
END;
$$;
REVOKE ALL ON FUNCTION public.block_demo_job_raw_audit(uuid, bigint, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_demo_job_raw_audit(uuid, bigint, integer, text, jsonb) TO service_role;

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
  SELECT * INTO _job
  FROM public.demo_jobs j
  WHERE j.id = _job_id
    AND j.queue_message_id = _message_id
    AND j.dispatch_attempt = _attempt
    AND j.worker_id = _worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'claim_not_current');
  END IF;
  IF _job.lease_expires_at IS NULL OR _job.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'lease_expired');
  END IF;
  IF _job.status NOT IN ('processed', 'blocked_raw_audit', 'cancelled') THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'job_not_terminal');
  END IF;

  SELECT pgmq.archive('demo_parse', _message_id) INTO _archived;
  IF NOT COALESCE(_archived, false) THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'message_not_archived');
  END IF;

  UPDATE public.demo_jobs
     SET lease_expires_at = NULL,
         worker_id = NULL,
         updated_at = now()
   WHERE id = _job_id
     AND queue_message_id = _message_id
     AND dispatch_attempt = _attempt
     AND worker_id = _worker_id;

  RETURN jsonb_build_object(
    'acknowledged', true,
    'status', _job.status::text,
    'redeliverable', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_demo_parse_message(uuid, bigint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_demo_parse_message(uuid, bigint, integer, text) TO service_role;