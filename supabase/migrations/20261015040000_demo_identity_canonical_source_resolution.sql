-- Resolve Steam identity against the canonical match persisted for this upload.
-- The job's match_id is intentionally assigned by finish_demo_job_processed only
-- at terminalization; identity evidence must not require that later transition.

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
  _canonical_match_id uuid;
  _participant public.match_participants%ROWTYPE;
  _inserted boolean := false;
  _nickname text;
  _normalized text;
  _status text;
  _source text;
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
  IF _status IS NULL OR _status <> ALL (ARRAY['unresolved','auto_resolved','awaiting_manual_selection','manually_resolved','rejected_auto_match','conflict','confirmed']) THEN
    RAISE EXCEPTION 'IDENTITY_STATUS_INVALID';
  END IF;
  IF _source IS NULL OR _source <> ALL (ARRAY['system','user']) THEN
    RAISE EXCEPTION 'IDENTITY_SOURCE_INVALID';
  END IF;
  IF _status = ANY (ARRAY['confirmed','rejected_auto_match'])
     AND _latest_status = ANY (ARRAY['confirmed','rejected_auto_match'])
     AND _latest_status <> _status THEN
    RAISE EXCEPTION 'IDENTITY_DECISION_CONFLICT';
  END IF;

  _canonical_match_id := _job.match_id;
  IF NULLIF(_decision->>'participant_key', '') IS NOT NULL THEN
    -- Canonical persistence and job terminalization are separate transactions.
    -- Resolve the match from this exact upload's durable Canonical source rather
    -- than requiring finish_demo_job_processed to have populated demo_jobs.match_id.
    SELECT ms.match_id
    INTO _canonical_match_id
    FROM public.match_sources ms
    WHERE ms.upload_id = _job.upload_id
      AND ms.source = 'demo'
      AND ms.match_id IS NOT NULL
    ORDER BY ms.updated_at DESC, ms.created_at DESC
    LIMIT 1;

    IF _canonical_match_id IS NULL THEN
      RAISE EXCEPTION 'MATCH_NOT_ANALYSED';
    END IF;
    IF _job.match_id IS NOT NULL AND _job.match_id IS DISTINCT FROM _canonical_match_id THEN
      RAISE EXCEPTION 'CANONICAL_MATCH_MISMATCH';
    END IF;

    SELECT * INTO _participant
    FROM public.match_participants
    WHERE match_id = _canonical_match_id
      AND participant_key = _decision->>'participant_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPANT_NOT_IN_MATCH'; END IF;
  END IF;

  _nickname := COALESCE(NULLIF(_decision->>'nickname', ''), _participant.nickname_snapshot);
  IF _nickname IS NOT NULL AND length(_nickname) > 64 THEN RAISE EXCEPTION 'NICKNAME_INVALID'; END IF;
  _normalized := CASE WHEN _nickname IS NULL THEN NULL ELSE lower(btrim(regexp_replace(normalize(_nickname, NFKC), '\s+', ' ', 'g'))) END;

  INSERT INTO public.demo_identity_decisions (
    job_id, upload_id, match_id, player_id, user_id, event_key, status,
    participant_key, nickname, team, method, source, confidence_label,
    confidence_score, reason, evidence
  ) VALUES (
    _job.id, _job.upload_id, _canonical_match_id, _player_id, _user_id, _event_key, _status,
    NULLIF(_decision->>'participant_key', ''), _nickname, _participant.team,
    NULLIF(_decision->>'method', ''), _source,
    NULLIF(_decision->>'confidence_label', ''),
    NULLIF(_decision->>'confidence_score', '')::numeric,
    NULLIF(_decision->>'reason', ''),
    COALESCE(_decision->'evidence', '{}'::jsonb)
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
      CASE WHEN _source = 'user' THEN 'manual_selection' ELSE 'demo_observation' END,
      NULLIF(_decision->>'method', ''), NULLIF(_decision->>'confidence_label', ''),
      NULLIF(_decision->>'confidence_score', '')::numeric,
      COALESCE(_participant.steam_id64, NULLIF(_decision->>'steam_id', '')),
      _job.id, _job.id, _job.upload_id, _job.upload_id,
      _canonical_match_id, _canonical_match_id,
      jsonb_build_object('latest_event_key', _event_key)
    )
    ON CONFLICT (player_id, normalized_nickname) DO UPDATE SET
      nickname = EXCLUDED.nickname,
      source = EXCLUDED.source,
      method = EXCLUDED.method,
      confidence_label = EXCLUDED.confidence_label,
      confidence_score = EXCLUDED.confidence_score,
      steam_id = COALESCE(EXCLUDED.steam_id, public.player_nickname_history.steam_id),
      last_seen_at = CASE
        WHEN public.player_nickname_history.last_job_id IS DISTINCT FROM EXCLUDED.last_job_id THEN now()
        ELSE public.player_nickname_history.last_seen_at
      END,
      times_seen = public.player_nickname_history.times_seen + CASE
        WHEN public.player_nickname_history.last_job_id IS DISTINCT FROM EXCLUDED.last_job_id THEN 1
        ELSE 0
      END,
      last_job_id = EXCLUDED.last_job_id,
      last_upload_id = EXCLUDED.last_upload_id,
      last_match_id = EXCLUDED.last_match_id,
      metadata = public.player_nickname_history.metadata || EXCLUDED.metadata,
      updated_at = now();
  END IF;

  RETURN COALESCE(_inserted, false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_demo_identity_event(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_demo_identity_event(uuid, uuid, text, jsonb)
  TO service_role;
