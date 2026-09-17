CREATE OR REPLACE FUNCTION public.decide_demo_automatic_identity(
  _job_id uuid,
  _user_id uuid,
  _action text,
  _expected_latest_event_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _event_key text;
  _status text;
  _confirmation_status text;
  _recorded boolean;
BEGIN
  IF _action <> ALL (ARRAY['confirm','reject']) THEN
    RAISE EXCEPTION 'IDENTITY_ACTION_INVALID';
  END IF;

  SELECT * INTO _job
  FROM public.demo_jobs
  WHERE id = _job_id AND user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;

  IF _job.attachment_state <> 'attached'
     OR _job.attachment_method <> 'steam_id_confirmed'
     OR _job.attachment_source <> ALL (ARRAY['steam','system'])
     OR _job.attachment_participant_key IS NULL THEN
    RAISE EXCEPTION 'AUTOMATIC_MATCH_NOT_AVAILABLE';
  END IF;

  _status := CASE WHEN _action = 'confirm' THEN 'confirmed' ELSE 'rejected_auto_match' END;
  _confirmation_status := CASE WHEN _action = 'confirm' THEN 'user_confirmed' ELSE 'user_rejected' END;
  _event_key := _action || ':steam:' || _job.attachment_participant_key;

  _recorded := public.record_demo_identity_event(
    _job.id,
    _user_id,
    _event_key,
    jsonb_build_object(
      'status', _status,
      'confirmation_status', _confirmation_status,
      'participant_key', _job.attachment_participant_key,
      'nickname', _job.observed_nickname,
      'method', _job.attachment_method,
      'source', CASE WHEN _job.attachment_source = 'system' THEN 'steam' ELSE _job.attachment_source END,
      'confidence_label', _job.attachment_confidence_label,
      'confidence_score', _job.attachment_confidence,
      'reason', CASE WHEN _action = 'reject' THEN 'user_rejected_auto_match' ELSE NULL END,
      'evidence', jsonb_build_object('automatic_source', 'steam'),
      'expected_latest_event_key', _expected_latest_event_key
    )
  );

  IF _recorded THEN
    UPDATE public.demo_jobs
    SET attachment_confirmation_status = _confirmation_status,
        attachment_state = CASE WHEN _action = 'reject' THEN 'unattached' ELSE attachment_state END,
        attachment_reason = CASE WHEN _action = 'reject' THEN 'user_rejected_auto_match' ELSE attachment_reason END,
        updated_at = now()
    WHERE id = _job.id;
  END IF;

  RETURN _recorded;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_demo_automatic_identity(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_demo_automatic_identity(uuid, uuid, text, text) TO service_role;