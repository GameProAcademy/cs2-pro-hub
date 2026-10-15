-- H3E91: acknowledge the exact terminal dispatch even when the terminal transition
-- clears queue_message_id along with its lease fields.
--
-- Safety: bind to the locked job ID + dispatch_attempt; if queue_message_id is still
-- populated it must match. Before archiving, independently prove the live pgmq message
-- carries this job ID. A retry after archive is idempotent only when the archive row
-- for that same message also carries this job ID.
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
  _live_message_matches boolean := false;
  _archived_message_matches boolean := false;
BEGIN
  SELECT * INTO _job
  FROM public.demo_jobs j
  WHERE j.id = _job_id
    AND j.dispatch_attempt = _attempt
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('acknowledged', false, 'reason', 'claim_not_current');
  END IF;

  IF _job.queue_message_id IS NOT NULL AND _job.queue_message_id <> _message_id THEN
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

  SELECT EXISTS (
    SELECT 1
    FROM pgmq.q_demo_parse q
    WHERE q.msg_id = _message_id
      AND q.message->>'job_id' = _job_id::text
  ) INTO _live_message_matches;

  IF NOT _live_message_matches THEN
    SELECT EXISTS (
      SELECT 1
      FROM pgmq.a_demo_parse a
      WHERE a.msg_id = _message_id
        AND a.message->>'job_id' = _job_id::text
    ) INTO _archived_message_matches;

    IF _archived_message_matches THEN
      RETURN jsonb_build_object(
        'acknowledged', true,
        'status', _job.status::text,
        'redeliverable', false,
        'already_archived', true
      );
    END IF;

    RETURN jsonb_build_object('acknowledged', false, 'reason', 'message_not_current');
  END IF;

  SELECT pgmq.archive('demo_parse', _message_id) INTO _archived;
  IF NOT COALESCE(_archived, false) THEN
    SELECT EXISTS (
      SELECT 1
      FROM pgmq.a_demo_parse a
      WHERE a.msg_id = _message_id
        AND a.message->>'job_id' = _job_id::text
    ) INTO _archived_message_matches;

    IF _archived_message_matches THEN
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
