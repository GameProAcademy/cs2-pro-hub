ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS demo_jobs_cancel_requested_idx
  ON public.demo_jobs (cancel_requested_at)
  WHERE status = 'cancel_requested';
CREATE INDEX IF NOT EXISTS demo_jobs_heartbeat_idx
  ON public.demo_jobs (heartbeat_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.request_demo_job_cancel(_job_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _next_status public.upload_status;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _job
    FROM public.demo_jobs
   WHERE id = _job_id AND user_id = _user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  IF _job.status IN ('cancel_requested', 'cancelled') THEN
    RETURN jsonb_build_object('job_id', _job.id, 'status', _job.status::text, 'changed', false);
  END IF;
  IF _job.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('job_id', _job.id, 'status', _job.status::text, 'changed', false);
  END IF;

  _next_status := CASE WHEN _job.status = 'pending' THEN 'cancelled'::public.upload_status
                       ELSE 'cancel_requested'::public.upload_status END;

  UPDATE public.demo_jobs
     SET status = _next_status,
         stage = CASE WHEN _next_status = 'cancelled' THEN 'cancelled' ELSE 'cancel_requested' END,
         cancel_requested_at = COALESCE(cancel_requested_at, now()),
         cancelled_at = CASE WHEN _next_status = 'cancelled' THEN now() ELSE cancelled_at END,
         cancelled_by = _user_id,
         finished_at = CASE WHEN _next_status = 'cancelled' THEN now() ELSE finished_at END,
         duration_ms = CASE WHEN _next_status = 'cancelled' AND started_at IS NOT NULL
           THEN GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000)::integer)
           ELSE duration_ms END,
         error_code = NULL,
         error_message = NULL,
         updated_at = now()
   WHERE id = _job.id;

  UPDATE public.uploads
     SET status = _next_status, error_code = NULL, error_message = NULL
   WHERE id = _job.upload_id;

  RETURN jsonb_build_object('job_id', _job.id, 'status', _next_status::text, 'changed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.request_demo_job_cancel(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_demo_job_cancel(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_demo_job_cancelled(_job_id uuid, _cleanup_error text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _upload_id uuid;
BEGIN
  UPDATE public.demo_jobs
     SET status = 'cancelled', stage = 'cancelled', cancelled_at = COALESCE(cancelled_at, now()),
         finished_at = COALESCE(finished_at, now()), heartbeat_at = NULL,
         duration_ms = CASE WHEN started_at IS NULL THEN duration_ms ELSE GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000)::integer) END,
         cleanup_error = _cleanup_error, error_code = NULL, error_message = NULL, updated_at = now()
   WHERE id = _job_id AND status = 'cancel_requested'
   RETURNING upload_id INTO _upload_id;
  IF _upload_id IS NULL THEN RETURN false; END IF;
  UPDATE public.uploads SET status = 'cancelled', error_code = NULL, error_message = NULL WHERE id = _upload_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_demo_job_cancelled(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_demo_job_cancelled(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_demo_jobs(_stale_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _count integer;
BEGIN
  WITH stale AS (
    SELECT id, upload_id, retry_count, max_retries FROM public.demo_jobs
     WHERE status = 'processing'
       AND COALESCE(heartbeat_at, started_at) < now() - make_interval(mins => GREATEST(COALESCE(_stale_minutes, 15), 1))
     FOR UPDATE SKIP LOCKED
  ), recovered AS (
    UPDATE public.demo_jobs j SET
      status = CASE WHEN s.retry_count < s.max_retries THEN 'pending'::public.upload_status ELSE 'failed'::public.upload_status END,
      stage = CASE WHEN s.retry_count < s.max_retries THEN 'queued' ELSE 'failed' END,
      retry_count = s.retry_count + 1, started_at = NULL, heartbeat_at = NULL,
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

CREATE OR REPLACE FUNCTION public.requeue_demo_job_after_attachment(_job_id uuid, _user_id uuid, _attachment jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _upload_id uuid;
BEGIN
  UPDATE public.demo_jobs SET
    declared_participant_key = NULLIF(_attachment->>'declared_participant_key', ''), declared_nickname = NULLIF(_attachment->>'declared_nickname', ''),
    attachment_declared_at = now(), attachment_declared_by = _user_id,
    attachment_state = COALESCE(_attachment->>'state', attachment_state), attachment_method = NULLIF(_attachment->>'method', ''),
    attachment_source = NULLIF(_attachment->>'source', ''), attachment_confidence = NULLIF(_attachment->>'confidence_score', '')::numeric,
    attachment_confidence_label = NULLIF(_attachment->>'confidence', ''), attachment_participant_key = NULLIF(_attachment->>'participant_key', ''),
    observed_nickname = NULLIF(_attachment->>'observed_nickname', ''), attachment_reason = NULLIF(_attachment->>'reason', ''),
    status = CASE WHEN _attachment->>'state' = 'attached' THEN 'pending'::public.upload_status ELSE status END,
    stage = CASE WHEN _attachment->>'state' = 'attached' THEN 'queued' ELSE stage END,
    retry_count = CASE WHEN _attachment->>'state' = 'attached' THEN 0 ELSE retry_count END,
    queued_at = CASE WHEN _attachment->>'state' = 'attached' THEN now() ELSE queued_at END,
    started_at = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE started_at END,
    heartbeat_at = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE heartbeat_at END,
    finished_at = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE finished_at END,
    duration_ms = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE duration_ms END,
    error_code = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE error_code END,
    error_message = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE error_message END,
    cancel_requested_at = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE cancel_requested_at END,
    cancelled_at = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE cancelled_at END,
    cancelled_by = CASE WHEN _attachment->>'state' = 'attached' THEN NULL ELSE cancelled_by END,
    updated_at = now()
  WHERE id = _job_id AND user_id = _user_id AND status NOT IN ('processing', 'cancel_requested')
  RETURNING upload_id INTO _upload_id;
  IF _upload_id IS NULL THEN RETURN false; END IF;
  IF _attachment->>'state' = 'attached' THEN
    UPDATE public.uploads SET status = 'pending', processed_at = NULL, processing_duration_ms = NULL, error_code = NULL, error_message = NULL WHERE id = _upload_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.requeue_demo_job_after_attachment(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_demo_job_after_attachment(uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_next_demo_job(_max_concurrent integer DEFAULT 1)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _id uuid; _busy integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_next_demo_job'));
  SELECT count(*) INTO _busy FROM public.demo_jobs WHERE status = 'processing';
  IF _busy >= COALESCE(_max_concurrent, 1) THEN RETURN NULL; END IF;
  SELECT id INTO _id FROM public.demo_jobs WHERE status = 'pending' ORDER BY queued_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF _id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.demo_jobs SET status = 'processing', stage = 'validating', started_at = now(), heartbeat_at = now(),
    finished_at = NULL, duration_ms = NULL, error_code = NULL, error_message = NULL, updated_at = now() WHERE id = _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_next_demo_job(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_demo_job(integer) TO service_role;