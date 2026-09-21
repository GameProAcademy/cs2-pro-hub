-- FASE 2.7.2G.6-R.3 — quality_flags JSONB regression fix.
CREATE OR REPLACE FUNCTION public.persist_demo_projection(
  _match_id uuid,
  _upload_id uuid,
  _player_id uuid,
  _steam_id text,
  _match_wide jsonb,
  _player_scoped jsonb,
  _metrics jsonb,
  _features jsonb,
  _job_id uuid DEFAULT NULL,
  _job_result jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _existing_player uuid;
  _owns boolean;
  _job_upload_id uuid;
BEGIN
  IF _job_id IS NOT NULL THEN
    SELECT j.upload_id INTO _job_upload_id
    FROM public.demo_jobs j
    WHERE j.id = _job_id AND j.status = 'processing'
    FOR UPDATE;
    IF _job_upload_id IS NULL OR _job_upload_id <> _upload_id THEN
      RAISE EXCEPTION 'DEMO_JOB_NOT_FINALIZABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT m.player_id INTO _existing_player
  FROM public.matches m
  WHERE m.id = _match_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical match not found for projection: %', _match_id;
  END IF;

  _owns := _existing_player IS NULL OR _existing_player = _player_id;

  UPDATE public.matches SET
    platform = COALESCE(_match_wide->>'platform', platform),
    rounds = COALESCE((_match_wide->>'rounds')::int, rounds),
    duration_seconds = (_match_wide->>'duration_seconds')::int,
    game_version = _match_wide->>'game_version',
    demo_metadata = _match_wide->'demo_metadata'
  WHERE id = _match_id;

  IF _owns THEN
    UPDATE public.matches SET
      player_id = _player_id, upload_id = _upload_id,
      team_player = _player_scoped->>'team_player', team_opponent = _player_scoped->>'team_opponent',
      score_player = (_player_scoped->>'score_player')::int,
      score_opponent = (_player_scoped->>'score_opponent')::int,
      result = (_player_scoped->>'result')::public.match_result
    WHERE id = _match_id;
  END IF;

  INSERT INTO public.match_metrics (
    match_id, player_id, rounds_played, kills, deaths, assists, hs_percent, adr,
    kast, damage_taken, damage_efficiency, first_kills, first_deaths,
    opening_attempts, opening_success, opening_success_rate, trade_kills,
    trade_deaths, clutch_attempts, clutch_wins, clutches, multi_kills,
    utility_damage, grenade_damage, flash_assists, ct_rating, t_rating, rating
  ) VALUES (
    _match_id, _player_id, (_metrics->>'rounds_played')::int,
    (_metrics->>'kills')::int, (_metrics->>'deaths')::int, (_metrics->>'assists')::int,
    (_metrics->>'hs_percent')::numeric, (_metrics->>'adr')::numeric, (_metrics->>'kast')::numeric,
    (_metrics->>'damage_taken')::numeric, (_metrics->>'damage_efficiency')::numeric,
    (_metrics->>'first_kills')::int, (_metrics->>'first_deaths')::int,
    (_metrics->>'opening_attempts')::int, (_metrics->>'opening_success')::int,
    (_metrics->>'opening_success_rate')::numeric, (_metrics->>'trade_kills')::int,
    (_metrics->>'trade_deaths')::int, (_metrics->>'clutch_attempts')::int,
    (_metrics->>'clutch_wins')::int, (_metrics->>'clutches')::int,
    (_metrics->>'multi_kills')::int, (_metrics->>'utility_damage')::numeric,
    (_metrics->>'grenade_damage')::numeric, (_metrics->>'flash_assists')::int,
    (_metrics->>'ct_rating')::numeric, (_metrics->>'t_rating')::numeric,
    (_metrics->>'rating')::numeric
  )
  ON CONFLICT (match_id, player_id) DO UPDATE SET
    rounds_played = EXCLUDED.rounds_played, kills = EXCLUDED.kills, deaths = EXCLUDED.deaths,
    assists = EXCLUDED.assists, hs_percent = EXCLUDED.hs_percent, adr = EXCLUDED.adr,
    kast = EXCLUDED.kast, damage_taken = EXCLUDED.damage_taken,
    damage_efficiency = EXCLUDED.damage_efficiency, first_kills = EXCLUDED.first_kills,
    first_deaths = EXCLUDED.first_deaths, opening_attempts = EXCLUDED.opening_attempts,
    opening_success = EXCLUDED.opening_success, opening_success_rate = EXCLUDED.opening_success_rate,
    trade_kills = EXCLUDED.trade_kills, trade_deaths = EXCLUDED.trade_deaths,
    clutch_attempts = EXCLUDED.clutch_attempts, clutch_wins = EXCLUDED.clutch_wins,
    clutches = EXCLUDED.clutches, multi_kills = EXCLUDED.multi_kills,
    utility_damage = EXCLUDED.utility_damage, grenade_damage = EXCLUDED.grenade_damage,
    flash_assists = EXCLUDED.flash_assists, ct_rating = EXCLUDED.ct_rating,
    t_rating = EXCLUDED.t_rating, rating = EXCLUDED.rating;

  DELETE FROM public.match_features WHERE match_id = _match_id AND player_id = _player_id;
  INSERT INTO public.match_features (
    match_id, player_id, steam_id, sample_rounds, sample_opening_duels,
    sample_clutches, extraction_confidence, partial_parse, features,
    schema_version, analysis_version
  ) VALUES (
    _match_id, _player_id, _steam_id, (_features->>'sample_rounds')::int,
    (_features->>'sample_opening_duels')::int, (_features->>'sample_clutches')::int,
    (_features->>'extraction_confidence')::numeric,
    COALESCE((_features->>'partial_parse')::boolean, false),
    COALESCE(_features->'features', '{}'::jsonb), (_features->>'schema_version')::int,
    _features->>'analysis_version'
  );

  IF _job_id IS NOT NULL THEN
    UPDATE public.demo_jobs SET
      status = 'processed', stage = 'done',
      finished_at = COALESCE((_job_result->>'finished_at')::timestamptz, now()),
      heartbeat_at = NULL, duration_ms = (_job_result->>'duration_ms')::integer,
      match_id = _match_id, player_id = _player_id, resolved_steam_id = _steam_id,
      identity_status = 'resolved',
      attachment_state = COALESCE(NULLIF(_job_result->>'attachment_state', ''), attachment_state),
      attachment_method = NULLIF(_job_result->>'attachment_method', ''),
      attachment_confidence = NULLIF(_job_result->>'attachment_confidence', '')::numeric,
      attachment_confidence_label = NULLIF(_job_result->>'attachment_confidence_label', ''),
      attachment_source = NULLIF(_job_result->>'attachment_source', ''),
      attachment_participant_key = NULLIF(_job_result->>'attachment_participant_key', ''),
      observed_nickname = NULLIF(_job_result->>'observed_nickname', ''),
      attachment_reason = NULLIF(_job_result->>'attachment_reason', ''),
      parser_name = NULLIF(_job_result->>'parser_name', ''),
      parser_version = NULLIF(_job_result->>'parser_version', ''),
      parser_revision = NULLIF(_job_result->>'parser_revision', ''),
      schema_version = COALESCE((_job_result->>'schema_version')::integer, schema_version),
      analysis_version = COALESCE(NULLIF(_job_result->>'analysis_version', ''), analysis_version),
      rounds_detected = (_job_result->>'rounds_detected')::integer,
      rounds_valid = (_job_result->>'rounds_valid')::integer,
      players_detected = (_job_result->>'players_detected')::integer,
      events_detected = (_job_result->>'events_detected')::integer,
      extraction_confidence = (_job_result->>'extraction_confidence')::numeric,
      partial_parse = COALESCE((_job_result->>'partial_parse')::boolean, false),
      quality_flags = COALESCE(_job_result->'quality_flags', '[]'::jsonb),
      error_code = NULL, error_message = NULL,
      retain_until = (_job_result->>'retain_until')::timestamptz,
      updated_at = now()
    WHERE id = _job_id AND status = 'processing';

    UPDATE public.uploads SET
      status = 'processed',
      processed_at = COALESCE((_job_result->>'finished_at')::timestamptz, now()),
      processing_duration_ms = (_job_result->>'duration_ms')::integer,
      parser_name = NULLIF(_job_result->>'parser_name', ''),
      parser_version = NULLIF(_job_result->>'parser_version', ''),
      schema_version = COALESCE((_job_result->>'schema_version')::integer, schema_version),
      analysis_version = COALESCE(NULLIF(_job_result->>'analysis_version', ''), analysis_version),
      error_code = NULL, error_message = NULL
    WHERE id = _upload_id;
  END IF;

  RETURN _match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) TO service_role;
COMMENT ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) IS 'Atomic player projection and demo-job finalization; quality_flags remains JSONB and is never coerced to text[].';