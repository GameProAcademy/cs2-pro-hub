ALTER TABLE public.demo_identity_decisions
  ADD COLUMN IF NOT EXISTS confirmation_status text;

UPDATE public.demo_identity_decisions
SET confirmation_status = CASE
  WHEN status = 'confirmed' THEN 'user_confirmed'
  WHEN status = 'rejected_auto_match' THEN 'user_rejected'
  WHEN status = 'manually_resolved' THEN 'manual_selected'
  WHEN status = 'auto_resolved' THEN 'pending_confirmation'
  ELSE 'not_required'
END
WHERE confirmation_status IS NULL;

ALTER TABLE public.demo_identity_decisions
  ALTER COLUMN confirmation_status SET DEFAULT 'not_required',
  ALTER COLUMN confirmation_status SET NOT NULL;

ALTER TABLE public.demo_identity_decisions
  ADD CONSTRAINT demo_identity_decisions_confirmation_status_check
  CHECK (confirmation_status = ANY (ARRAY['pending_confirmation','user_confirmed','user_rejected','not_required','manual_selected']));

ALTER TABLE public.demo_jobs
  ADD COLUMN IF NOT EXISTS attachment_confirmation_status text;

UPDATE public.demo_jobs
SET attachment_confirmation_status = CASE
  WHEN attachment_state <> 'attached' THEN 'not_required'
  WHEN attachment_method = 'steam_id_confirmed' THEN 'pending_confirmation'
  ELSE 'manual_selected'
END
WHERE attachment_confirmation_status IS NULL;

UPDATE public.demo_jobs j
SET attachment_confirmation_status = CASE
  WHEN d.status = 'confirmed' THEN 'user_confirmed'
  WHEN d.status = 'rejected_auto_match' THEN 'user_rejected'
  ELSE j.attachment_confirmation_status
END
FROM (
  SELECT DISTINCT ON (job_id) job_id, status
  FROM public.demo_identity_decisions
  ORDER BY job_id, created_at DESC, id DESC
) d
WHERE d.job_id = j.id;

ALTER TABLE public.demo_jobs
  ALTER COLUMN attachment_confirmation_status SET DEFAULT 'not_required',
  ALTER COLUMN attachment_confirmation_status SET NOT NULL;

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_confirmation_status_check
  CHECK (attachment_confirmation_status = ANY (ARRAY['pending_confirmation','user_confirmed','user_rejected','not_required','manual_selected']));

ALTER TABLE public.demo_identity_decisions DROP CONSTRAINT demo_identity_decisions_source_check;
ALTER TABLE public.demo_identity_decisions
  ADD CONSTRAINT demo_identity_decisions_source_check
  CHECK (source = ANY (ARRAY['system','steam','faceit','gamersclub','user','multi_source']));

ALTER TABLE public.demo_jobs DROP CONSTRAINT demo_jobs_attachment_source_check;
ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_source_check
  CHECK (attachment_source IS NULL OR attachment_source = ANY (ARRAY['system','steam','faceit','gamersclub','user','multi_source']));

ALTER TABLE public.demo_jobs DROP CONSTRAINT demo_jobs_attachment_confidence_label_check;

UPDATE public.demo_identity_decisions
SET confidence_label = CASE
  WHEN confidence_label = 'user_confirmed' THEN 'medium'
  WHEN confidence_label = 'unresolved' THEN 'low'
  ELSE confidence_label
END;
UPDATE public.demo_jobs
SET attachment_confidence_label = CASE
  WHEN attachment_confidence_label = 'user_confirmed' THEN 'medium'
  WHEN attachment_confidence_label = 'unresolved' THEN 'low'
  ELSE attachment_confidence_label
END;
UPDATE public.player_nickname_history
SET confidence_label = CASE
  WHEN confidence_label = 'user_confirmed' THEN 'medium'
  WHEN confidence_label = 'unresolved' THEN 'low'
  ELSE confidence_label
END;

ALTER TABLE public.demo_jobs
  ADD CONSTRAINT demo_jobs_attachment_confidence_label_check
  CHECK (attachment_confidence_label IS NULL OR attachment_confidence_label = ANY (ARRAY['high','medium','low']));

ALTER TABLE public.demo_identity_decisions
  ADD CONSTRAINT demo_identity_decisions_confidence_label_check
  CHECK (confidence_label IS NULL OR confidence_label = ANY (ARRAY['high','medium','low']));
ALTER TABLE public.player_nickname_history
  ADD CONSTRAINT player_nickname_history_confidence_label_check
  CHECK (confidence_label IS NULL OR confidence_label = ANY (ARRAY['high','medium','low']));

CREATE OR REPLACE FUNCTION public.record_demo_identity_event(
  _job_id uuid,
  _user_id uuid,
  _event_key text,
  _decision jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _job public.demo_jobs%ROWTYPE;
  _player_id uuid;
  _participant public.match_participants%ROWTYPE;
  _inserted boolean := false;
  _nickname text;
  _normalized text;
  _status text;
  _source text;
  _confirmation_status text;
  _confidence_label text;
  _latest_event_key text;
  _latest_status text;
  _expected_latest_event_key text;
BEGIN
  IF _event_key IS NULL OR length(btrim(_event_key)) = 0 OR length(_event_key) > 160 THEN
    RAISE EXCEPTION 'IDENTITY_EVENT_KEY_INVALID';
  END IF;

  SELECT * INTO _job
  FROM public.demo_jobs
  WHERE id = _job_id AND user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;

  SELECT event_key, status INTO _latest_event_key, _latest_status
  FROM public.demo_identity_decisions
  WHERE job_id = _job_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  _expected_latest_event_key := NULLIF(_decision->>'expected_latest_event_key', '');
  IF _decision ? 'expected_latest_event_key'
     AND _latest_event_key IS DISTINCT FROM _expected_latest_event_key THEN
    RAISE EXCEPTION 'IDENTITY_DECISION_STALE';
  END IF;

  SELECT id INTO _player_id
  FROM public.player_profiles
  WHERE user_id = _user_id;
  IF _player_id IS NULL THEN RAISE EXCEPTION 'PLAYER_PROFILE_NOT_FOUND'; END IF;

  _status := NULLIF(_decision->>'status', '');
  _source := NULLIF(_decision->>'source', '');
  _confirmation_status := COALESCE(NULLIF(_decision->>'confirmation_status', ''), 'not_required');
  _confidence_label := NULLIF(_decision->>'confidence_label', '');

  IF _status IS NULL OR _status <> ALL (ARRAY['unresolved','auto_resolved','awaiting_manual_selection','manually_resolved','rejected_auto_match','conflict','confirmed']) THEN
    RAISE EXCEPTION 'IDENTITY_STATUS_INVALID';
  END IF;
  IF _source IS NULL OR _source <> ALL (ARRAY['system','steam','faceit','gamersclub','user','multi_source']) THEN
    RAISE EXCEPTION 'IDENTITY_SOURCE_INVALID';
  END IF;
  IF _confirmation_status <> ALL (ARRAY['pending_confirmation','user_confirmed','user_rejected','not_required','manual_selected']) THEN
    RAISE EXCEPTION 'IDENTITY_CONFIRMATION_INVALID';
  END IF;
  IF _confidence_label IS NOT NULL AND _confidence_label <> ALL (ARRAY['high','medium','low']) THEN
    RAISE EXCEPTION 'IDENTITY_CONFIDENCE_INVALID';
  END IF;
  IF _status = ANY (ARRAY['confirmed','rejected_auto_match'])
     AND _latest_status = ANY (ARRAY['confirmed','rejected_auto_match'])
     AND _latest_status <> _status THEN
    RAISE EXCEPTION 'IDENTITY_DECISION_CONFLICT';
  END IF;

  IF NULLIF(_decision->>'participant_key', '') IS NOT NULL THEN
    IF _job.match_id IS NULL THEN RAISE EXCEPTION 'MATCH_NOT_ANALYSED'; END IF;
    SELECT * INTO _participant
    FROM public.match_participants
    WHERE match_id = _job.match_id
      AND participant_key = _decision->>'participant_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_INVALID_PARTICIPANT'; END IF;
  END IF;

  _nickname := COALESCE(NULLIF(_decision->>'nickname', ''), _participant.nickname_snapshot);
  IF _nickname IS NOT NULL AND length(_nickname) > 64 THEN RAISE EXCEPTION 'NICKNAME_INVALID'; END IF;
  _normalized := CASE WHEN _nickname IS NULL THEN NULL ELSE lower(btrim(regexp_replace(normalize(_nickname, NFKC), '\s+', ' ', 'g'))) END;

  INSERT INTO public.demo_identity_decisions (
    job_id, upload_id, match_id, player_id, user_id, event_key, status,
    participant_key, nickname, team, method, source, confidence_label,
    confidence_score, reason, evidence, confirmation_status
  ) VALUES (
    _job.id, _job.upload_id, _job.match_id, _player_id, _user_id, _event_key, _status,
    NULLIF(_decision->>'participant_key', ''), _nickname, _participant.team,
    NULLIF(_decision->>'method', ''), _source, _confidence_label,
    NULLIF(_decision->>'confidence_score', '')::numeric,
    NULLIF(_decision->>'reason', ''), COALESCE(_decision->'evidence', '{}'::jsonb),
    _confirmation_status
  )
  ON CONFLICT (job_id, event_key) DO NOTHING
  RETURNING true INTO _inserted;

  IF COALESCE(_inserted, false) AND _nickname IS NOT NULL AND _normalized IS NOT NULL
     AND _status = ANY (ARRAY['auto_resolved','manually_resolved','confirmed']) THEN
    INSERT INTO public.player_nickname_history (
      player_id, nickname, normalized_nickname, source, method,
      confidence_label, confidence_score, steam_id,
      first_job_id, last_job_id, first_upload_id, last_upload_id,
      first_match_id, last_match_id, metadata
    ) VALUES (
      _player_id, _nickname, _normalized,
      CASE WHEN _confirmation_status = 'manual_selected' THEN 'manual_selection' ELSE 'demo_observation' END,
      NULLIF(_decision->>'method', ''), _confidence_label,
      NULLIF(_decision->>'confidence_score', '')::numeric,
      COALESCE(_participant.steam_id64, NULLIF(_decision->>'steam_id', '')),
      _job.id, _job.id, _job.upload_id, _job.upload_id,
      _job.match_id, _job.match_id,
      jsonb_build_object('latest_event_key', _event_key, 'identity_source', _source, 'confirmation_status', _confirmation_status)
    )
    ON CONFLICT (player_id, normalized_nickname) DO UPDATE SET
      nickname = EXCLUDED.nickname,
      source = EXCLUDED.source,
      method = EXCLUDED.method,
      confidence_label = EXCLUDED.confidence_label,
      confidence_score = EXCLUDED.confidence_score,
      steam_id = COALESCE(EXCLUDED.steam_id, public.player_nickname_history.steam_id),
      last_seen_at = CASE WHEN public.player_nickname_history.last_job_id IS DISTINCT FROM EXCLUDED.last_job_id THEN now() ELSE public.player_nickname_history.last_seen_at END,
      times_seen = public.player_nickname_history.times_seen + CASE WHEN public.player_nickname_history.last_job_id IS DISTINCT FROM EXCLUDED.last_job_id THEN 1 ELSE 0 END,
      last_job_id = EXCLUDED.last_job_id,
      last_upload_id = EXCLUDED.last_upload_id,
      last_match_id = EXCLUDED.last_match_id,
      metadata = public.player_nickname_history.metadata || EXCLUDED.metadata,
      updated_at = now();
  END IF;

  RETURN COALESCE(_inserted, false);
END;
$$;
REVOKE ALL ON FUNCTION public.record_demo_identity_event(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_demo_identity_event(uuid, uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_demo_job_after_attachment(_job_id uuid, _user_id uuid, _attachment jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _upload_id uuid;
  _event_key text;
  _latest_event_key text;
  _expected_latest_event_key text;
BEGIN
  SELECT upload_id INTO _upload_id
  FROM public.demo_jobs
  WHERE id = _job_id AND user_id = _user_id
    AND status NOT IN ('processing', 'cancel_requested', 'cancelled')
  FOR UPDATE;
  IF _upload_id IS NULL THEN RETURN false; END IF;

  SELECT event_key INTO _latest_event_key
  FROM public.demo_identity_decisions
  WHERE job_id = _job_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  _expected_latest_event_key := NULLIF(_attachment->>'expected_latest_event_key', '');
  IF _attachment ? 'expected_latest_event_key'
     AND _latest_event_key IS DISTINCT FROM _expected_latest_event_key THEN
    RAISE EXCEPTION 'IDENTITY_DECISION_STALE';
  END IF;

  _event_key := COALESCE(NULLIF(_attachment->>'event_key', ''),
    'manual:' || COALESCE(NULLIF(_attachment->>'participant_key', ''), NULLIF(_attachment->>'declared_nickname', ''), 'unresolved'));

  PERFORM public.record_demo_identity_event(
    _job_id,
    _user_id,
    _event_key,
    jsonb_build_object(
      'status', CASE WHEN _attachment->>'state' = 'attached' THEN 'manually_resolved' WHEN _attachment->>'state' = 'conflict' THEN 'conflict' ELSE 'awaiting_manual_selection' END,
      'confirmation_status', CASE WHEN _attachment->>'state' = 'attached' THEN 'manual_selected' ELSE 'not_required' END,
      'participant_key', NULLIF(_attachment->>'participant_key', ''),
      'nickname', NULLIF(_attachment->>'observed_nickname', ''),
      'method', NULLIF(_attachment->>'method', ''),
      'source', COALESCE(NULLIF(_attachment->>'source', ''), 'user'),
      'confidence_label', NULLIF(_attachment->>'confidence', ''),
      'confidence_score', NULLIF(_attachment->>'confidence_score', ''),
      'reason', NULLIF(_attachment->>'reason', ''),
      'evidence', jsonb_build_object('declared_participant_key', NULLIF(_attachment->>'declared_participant_key', ''), 'declared_nickname', NULLIF(_attachment->>'declared_nickname', '')),
      'expected_latest_event_key', _expected_latest_event_key
    )
  );

  UPDATE public.demo_jobs SET
    declared_participant_key = NULLIF(_attachment->>'declared_participant_key', ''),
    declared_nickname = NULLIF(_attachment->>'declared_nickname', ''),
    attachment_declared_at = now(), attachment_declared_by = _user_id,
    attachment_state = COALESCE(_attachment->>'state', attachment_state),
    attachment_method = NULLIF(_attachment->>'method', ''),
    attachment_source = NULLIF(_attachment->>'source', ''),
    attachment_confidence = NULLIF(_attachment->>'confidence_score', '')::numeric,
    attachment_confidence_label = NULLIF(_attachment->>'confidence', ''),
    attachment_confirmation_status = CASE WHEN _attachment->>'state' = 'attached' THEN 'manual_selected' ELSE 'not_required' END,
    attachment_participant_key = NULLIF(_attachment->>'participant_key', ''),
    observed_nickname = NULLIF(_attachment->>'observed_nickname', ''),
    attachment_reason = NULLIF(_attachment->>'reason', ''),
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
  WHERE id = _job_id AND user_id = _user_id;

  IF _attachment->>'state' = 'attached' THEN
    UPDATE public.uploads SET status = 'pending', processed_at = NULL,
      processing_duration_ms = NULL, error_code = NULL, error_message = NULL
    WHERE id = _upload_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.requeue_demo_job_after_attachment(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_demo_job_after_attachment(uuid, uuid, jsonb) TO service_role;