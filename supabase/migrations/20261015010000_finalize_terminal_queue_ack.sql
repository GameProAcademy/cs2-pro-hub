-- H3E91: finalize a terminal dispatch after the terminal transition clears its lease.
--
-- completeDurableDemo persists the canonical result first. That transition can
-- clear worker_id/lease_expires_at before finalize_demo_parse_message is called.
-- Requiring the pre-terminal lease fields here leaves an already-processed job's
-- pgmq message live, even though the complete endpoint returned HTTP 200.
--
-- The immutable queue_message_id + dispatch_attempt bind the acknowledgement to
-- this exact dispatch. A still-populated worker_id must match the caller, and a
-- non-null lease must still be live. Terminal state is required before archive.
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
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'claim_not_current');
  END IF;

  IF _job.worker_id IS NOT NULL AND _job.worker_id IS DISTINCT FROM _worker_id THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'claim_not_current');
  END IF;

  IF _job.lease_expires_at IS NOT NULL AND _job.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'lease_expired');
  END IF;

  IF _job.status NOT IN ('processed', 'blocked_raw_audit', 'cancelled') THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'job_not_terminal');
  END IF;

  SELECT pgmq.archive('demo_parse', _message_id) INTO _archived;
  IF NOT COALESCE(_archived, false) THEN
    -- Idempotent ACK: if a previous call already archived this exact message,
    -- it is no longer in the live queue and must not be treated as a failure.
    IF EXISTS (
      SELECT 1
      FROM pgmq.a_demo_parse a
      WHERE a.msg_id = _message_id
    ) THEN
      RETURN jsonb_build_object(
        'acknowledged', true,
        'status', _job.status::text,
        'redeliverable', false,
        'already_archived', true
      );
    END IF;
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'message_not_archived');
  END IF;

  UPDATE public.demo_jobs
     SET lease_expires_at = NULL,
         worker_id = NULL,
         updated_at = now()
   WHERE id = _job_id
     AND queue_message_id = _message_id
     AND dispatch_attempt = _attempt;

  RETURN jsonb_build_object(
    'acknowledged', true,
    'status', _job.status::text,
    'redeliverable', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_demo_parse_message(uuid, bigint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_demo_parse_message(uuid, bigint, integer, text) TO service_role;
