CREATE OR REPLACE FUNCTION public.persist_canonical_observation(_bundle jsonb, _owner_player_id uuid DEFAULT NULL::uuid, _upload_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _obs jsonb := _bundle->'observation';
  _m jsonb := _bundle->'match';
  _ser jsonb := _bundle->'series';
  _source public.data_source;
  _ext text;
  _parent text;
  _fp text;
  _priority integer;
  _match_id uuid;
  _series_id uuid;
  _source_id uuid;
  _existing_source public.data_source;
  _existing_round_source public.data_source;
  _created boolean := false;
  _rounds_written integer := 0;
  _round_players_written integer := 0;
  _events_written integer := 0;
  _row jsonb;
  _round_ids jsonb := '{}'::jsonb;
  _round_id uuid;
BEGIN
  IF _bundle IS NULL OR _obs IS NULL OR _m IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_BUNDLE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((_m->>'schemaVersion')::integer, 0) <> 2 THEN
    RAISE EXCEPTION 'CANONICAL_SCHEMA_UNSUPPORTED' USING ERRCODE = '22023';
  END IF;

  _source := (_obs->>'source')::public.data_source;
  _ext := NULLIF(_obs->>'externalMatchId', '');
  _parent := NULLIF(_obs->>'externalParentId', '');
  _fp := NULLIF(_obs->>'fingerprint', '');
  IF _fp IS NULL AND _ext IS NULL AND _upload_id IS NOT NULL THEN
    _fp := 'upload:' || _upload_id::text;
  END IF;
  IF _fp IS NULL AND _ext IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_OBSERVATION_UNIDENTIFIABLE' USING ERRCODE = '22023';
  END IF;
  _priority := public.canonical_source_priority(_source);

  PERFORM pg_advisory_xact_lock(hashtext('public.persist_canonical_observation'),
                                hashtext(_source::text || '|' || COALESCE(_ext, _fp)));

  IF _ext IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND external_match_id = _ext
     FOR UPDATE;
  END IF;
  IF _source_id IS NULL AND _fp IS NOT NULL THEN
    SELECT id, match_id INTO _source_id, _match_id
      FROM public.match_sources
     WHERE source = _source AND fingerprint = _fp
     FOR UPDATE;
  END IF;

  -- Same content already stored (identical demo file).
  IF _match_id IS NULL AND _fp IS NOT NULL AND _fp NOT LIKE 'upload:%' THEN
    SELECT id INTO _match_id FROM public.matches WHERE content_fingerprint = _fp FOR UPDATE;
  END IF;

  -- A demo upload already persisted by the demo pipeline is the SAME match.
  IF _match_id IS NULL AND _upload_id IS NOT NULL THEN
    SELECT id INTO _match_id FROM public.matches WHERE upload_id = _upload_id FOR UPDATE;
  END IF;

  IF _ser IS NOT NULL AND jsonb_typeof(_ser) = 'object' AND _parent IS NOT NULL THEN
    INSERT INTO public.match_series (
      game, source, external_series_id, best_of, status, started_at, finished_at,
      duration_seconds, team_a, team_b, maps_won_team_a, maps_won_team_b, winner_team,
      canonical_schema_version, quality, metadata)
    VALUES (
      COALESCE(_ser->>'game','cs2'), _source, _parent, (_ser->>'bestOf')::integer,
      COALESCE(_ser->>'status','unknown'), (_ser->>'startedAt')::timestamptz,
      (_ser->>'finishedAt')::timestamptz, (_ser->>'durationSeconds')::integer,
      _ser->>'teamA', _ser->>'teamB', (_ser->>'mapsWonTeamA')::integer,
      (_ser->>'mapsWonTeamB')::integer, _ser->>'winnerTeam',
      COALESCE((_ser->>'schemaVersion')::integer, 2),
      COALESCE(_ser->'quality','{}'::jsonb), COALESCE(_ser->'metadata','{}'::jsonb))
    ON CONFLICT (source, external_series_id) WHERE external_series_id IS NOT NULL
    DO UPDATE SET
      best_of = COALESCE(EXCLUDED.best_of, public.match_series.best_of),
      status = EXCLUDED.status,
      started_at = COALESCE(EXCLUDED.started_at, public.match_series.started_at),
      finished_at = COALESCE(EXCLUDED.finished_at, public.match_series.finished_at),
      duration_seconds = COALESCE(EXCLUDED.duration_seconds, public.match_series.duration_seconds),
      team_a = COALESCE(EXCLUDED.team_a, public.match_series.team_a),
      team_b = COALESCE(EXCLUDED.team_b, public.match_series.team_b),
      maps_won_team_a = COALESCE(EXCLUDED.maps_won_team_a, public.match_series.maps_won_team_a),
      maps_won_team_b = COALESCE(EXCLUDED.maps_won_team_b, public.match_series.maps_won_team_b),
      winner_team = COALESCE(EXCLUDED.winner_team, public.match_series.winner_team),
      quality = EXCLUDED.quality,
      metadata = public.match_series.metadata || EXCLUDED.metadata,
      updated_at = now()
    RETURNING id INTO _series_id;
  END IF;

  IF _match_id IS NULL THEN
    INSERT INTO public.matches (
      player_id, upload_id, platform, data_source, series_id, game, map, map_number,
      match_date, played_at, started_at, finished_at, duration_seconds, canonical_status,
      finished, terminal, team_a, team_b, score_team_a, score_team_b, winner_team,
      round_count, rounds, canonical_schema_version, quality, coverage, content_fingerprint,
      canonical_source, source_fetched_at, source_version, source_complete)
    VALUES (
      _owner_player_id, _upload_id, _source::text, _source, _series_id,
      COALESCE(_m->>'game','cs2'), _m->>'map', (_m->>'mapNumber')::integer,
      (_m->>'playedAt')::timestamptz, (_m->>'playedAt')::timestamptz,
      (_m->>'startedAt')::timestamptz, (_m->>'finishedAt')::timestamptz,
      (_m->>'durationSeconds')::integer, COALESCE(_m->>'status','unknown'),
      COALESCE((_m->>'finished')::boolean, false), COALESCE((_m->>'terminal')::boolean, false),
      _m->>'teamA', _m->>'teamB', (_m->>'scoreTeamA')::integer, (_m->>'scoreTeamB')::integer,
      _m->>'winnerTeam', (_m->>'roundCount')::integer, (_m->>'roundCount')::integer, 2,
      COALESCE(_m->'quality','{}'::jsonb), COALESCE(_m->'coverage','{}'::jsonb),
      CASE WHEN _fp LIKE 'upload:%' THEN NULL ELSE _fp END,
      _source, (_obs->>'fetchedAt')::timestamptz, _obs->>'sourceVersion',
      COALESCE(_obs->>'status','unknown') = 'complete')
    RETURNING id INTO _match_id;
    _created := true;
  ELSE
    SELECT canonical_source, round_source INTO _existing_source, _existing_round_source
      FROM public.matches WHERE id = _match_id FOR UPDATE;
    IF _existing_source IS NULL
       OR _priority >= public.canonical_source_priority(_existing_source) THEN
      UPDATE public.matches SET
        series_id = COALESCE(_series_id, series_id),
        map = COALESCE(_m->>'map', map),
        map_number = COALESCE((_m->>'mapNumber')::integer, map_number),
        match_date = COALESCE((_m->>'playedAt')::timestamptz, match_date),
        played_at = COALESCE((_m->>'playedAt')::timestamptz, played_at),
        started_at = COALESCE((_m->>'startedAt')::timestamptz, started_at),
        finished_at = COALESCE((_m->>'finishedAt')::timestamptz, finished_at),
        duration_seconds = COALESCE((_m->>'durationSeconds')::integer, duration_seconds),
        canonical_status = COALESCE(_m->>'status', canonical_status),
        finished = COALESCE((_m->>'finished')::boolean, finished),
        terminal = COALESCE((_m->>'terminal')::boolean, terminal),
        team_a = COALESCE(_m->>'teamA', team_a),
        team_b = COALESCE(_m->>'teamB', team_b),
        score_team_a = COALESCE((_m->>'scoreTeamA')::integer, score_team_a),
        score_team_b = COALESCE((_m->>'scoreTeamB')::integer, score_team_b),
        winner_team = COALESCE(_m->>'winnerTeam', winner_team),
        round_count = COALESCE((_m->>'roundCount')::integer, round_count),
        quality = COALESCE(_m->'quality', quality),
        coverage = COALESCE(_m->'coverage', coverage),
        content_fingerprint = COALESCE(content_fingerprint,
          CASE WHEN _fp LIKE 'upload:%' THEN NULL ELSE _fp END),
        canonical_source = _source,
        player_id = COALESCE(player_id, _owner_player_id),
        upload_id = COALESCE(upload_id, _upload_id),
        data_source = _source,
        source_fetched_at = (_obs->>'fetchedAt')::timestamptz,
        source_version = COALESCE(_obs->>'sourceVersion', source_version)
      WHERE id = _match_id;
    ELSE
      UPDATE public.matches SET
        series_id = COALESCE(series_id, _series_id),
        player_id = COALESCE(player_id, _owner_player_id)
      WHERE id = _match_id;
    END IF;
  END IF;

  IF _source_id IS NULL THEN
    INSERT INTO public.match_sources (
      match_id, series_id, source, source_contract_version, external_match_id,
      external_parent_id, source_version, fetched_at, source_updated_at, status,
      quality, fingerprint, upload_id, metadata)
    VALUES (
      _match_id, _series_id, _source, COALESCE(_obs->>'sourceContractVersion','unknown'),
      _ext, _parent, _obs->>'sourceVersion',
      COALESCE((_obs->>'fetchedAt')::timestamptz, now()),
      (_obs->>'sourceUpdatedAt')::timestamptz, COALESCE(_obs->>'status','unknown'),
      COALESCE(_obs->'quality','{}'::jsonb), _fp, _upload_id,
      COALESCE(_obs->'metadata','{}'::jsonb))
    RETURNING id INTO _source_id;
  ELSE
    UPDATE public.match_sources SET
      match_id = _match_id,
      series_id = COALESCE(_series_id, series_id),
      source_contract_version = COALESCE(_obs->>'sourceContractVersion', source_contract_version),
      external_match_id = COALESCE(_ext, external_match_id),
      external_parent_id = COALESCE(_parent, external_parent_id),
      source_version = COALESCE(_obs->>'sourceVersion', source_version),
      fetched_at = COALESCE((_obs->>'fetchedAt')::timestamptz, fetched_at),
      source_updated_at = COALESCE((_obs->>'sourceUpdatedAt')::timestamptz, source_updated_at),
      status = COALESCE(_obs->>'status', status),
      quality = COALESCE(_obs->'quality', quality),
      fingerprint = COALESCE(_fp, fingerprint),
      upload_id = COALESCE(_upload_id, upload_id),
      observation_count = observation_count + 1,
      metadata = metadata || COALESCE(_obs->'metadata','{}'::jsonb)
    WHERE id = _source_id;
  END IF;

  FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'participants','[]'::jsonb)) LOOP
    INSERT INTO public.match_participants (
      match_id, participant_key, internal_player_id, source, external_player_id,
      steam_id64, nickname_snapshot, team, is_target_player, identity_status,
      identity_confidence, metadata)
    VALUES (
      _match_id, _row->>'participantKey', NULLIF(_row->>'internalPlayerId','')::uuid,
      _source, _row->>'externalPlayerId', _row->>'steamId64', _row->>'nicknameSnapshot',
      _row->>'team', COALESCE((_row->>'isTargetPlayer')::boolean, false),
      COALESCE((_row->>'identityStatus')::public.identity_link_status, 'unlinked'),
      (_row->>'identityConfidence')::numeric, COALESCE(_row->'metadata','{}'::jsonb))
    ON CONFLICT (match_id, participant_key) DO UPDATE SET
      internal_player_id = COALESCE(EXCLUDED.internal_player_id,
                                    public.match_participants.internal_player_id),
      external_player_id = COALESCE(EXCLUDED.external_player_id,
                                    public.match_participants.external_player_id),
      steam_id64 = COALESCE(EXCLUDED.steam_id64, public.match_participants.steam_id64),
      nickname_snapshot = COALESCE(EXCLUDED.nickname_snapshot,
                                   public.match_participants.nickname_snapshot),
      team = COALESCE(EXCLUDED.team, public.match_participants.team),
      is_target_player = public.match_participants.is_target_player OR EXCLUDED.is_target_player,
      identity_confidence = GREATEST(COALESCE(public.match_participants.identity_confidence, 0),
                                     COALESCE(EXCLUDED.identity_confidence, 0)),
      metadata = public.match_participants.metadata || EXCLUDED.metadata,
      updated_at = now();
  END LOOP;

  -- FASE 2.6.9 — referential integrity of per-round rows. A per-round row that
  -- names an unknown participant or an unknown round is a broken observation:
  -- the WHOLE transaction is refused rather than writing orphan evidence.
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(_bundle->'roundPlayers','[]'::jsonb)) AS rp(value)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.match_participants mp
        WHERE mp.match_id = _match_id
          AND mp.participant_key = rp.value->>'participantKey')
  ) THEN
    RAISE EXCEPTION 'CANONICAL_PARTICIPANT_UNKNOWN' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(_bundle->'events','[]'::jsonb)) AS ev(value)
      CROSS JOIN LATERAL (VALUES
        (ev.value->>'actorParticipantKey'),
        (ev.value->>'victimParticipantKey'),
        (ev.value->>'assisterParticipantKey')) AS k(participant_key)
     WHERE k.participant_key IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = _match_id
            AND mp.participant_key = k.participant_key)
  ) THEN
    RAISE EXCEPTION 'CANONICAL_PARTICIPANT_UNKNOWN' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
             COALESCE(_bundle->'roundPlayers','[]'::jsonb) || COALESCE(_bundle->'events','[]'::jsonb)
           ) AS r(value)
     WHERE NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(_bundle->'rounds','[]'::jsonb)) AS b(value)
        WHERE b.value->>'roundNumber' = r.value->>'roundNumber')
  ) THEN
    RAISE EXCEPTION 'CANONICAL_ROUND_UNKNOWN' USING ERRCODE = '23503';
  END IF;

  IF jsonb_array_length(COALESCE(_bundle->'rounds','[]'::jsonb)) > 0
     AND (_existing_round_source IS NULL
          OR _priority >= public.canonical_source_priority(_existing_round_source)) THEN

    -- Per-observation derived rows are replaced; the ROUND rows themselves are
    -- updated in place so player-scoped columns written by the demo pipeline
    -- survive (evolution, not destruction).
    DELETE FROM public.round_events WHERE match_id = _match_id;
    DELETE FROM public.round_players WHERE match_id = _match_id;

    FOR _row IN SELECT value FROM jsonb_array_elements(_bundle->'rounds') LOOP
      INSERT INTO public.match_rounds (
        match_id, round_number, start_tick, end_tick, start_time_seconds, end_time_seconds,
        duration_seconds, winning_team, winning_side, winner_side, win_reason,
        bomb_planted, bomb_defused, bomb_exploded, quality, metadata)
      VALUES (
        _match_id, (_row->>'roundNumber')::integer, (_row->>'startTick')::integer,
        (_row->>'endTick')::integer, (_row->>'startTimeSeconds')::numeric,
        (_row->>'endTimeSeconds')::numeric, (_row->>'durationSeconds')::numeric,
        _row->>'winningTeam', _row->>'winningSide', _row->>'winningSide', _row->>'winReason',
        (_row->>'bombPlanted')::boolean, (_row->>'bombDefused')::boolean,
        (_row->>'bombExploded')::boolean, COALESCE(_row->'quality','{}'::jsonb),
        COALESCE(_row->'metadata','{}'::jsonb))
      ON CONFLICT (match_id, round_number) DO UPDATE SET
        start_tick = COALESCE(EXCLUDED.start_tick, public.match_rounds.start_tick),
        end_tick = COALESCE(EXCLUDED.end_tick, public.match_rounds.end_tick),
        start_time_seconds = COALESCE(EXCLUDED.start_time_seconds,
                                      public.match_rounds.start_time_seconds),
        end_time_seconds = COALESCE(EXCLUDED.end_time_seconds,
                                    public.match_rounds.end_time_seconds),
        duration_seconds = COALESCE(EXCLUDED.duration_seconds,
                                    public.match_rounds.duration_seconds),
        winning_team = COALESCE(EXCLUDED.winning_team, public.match_rounds.winning_team),
        winning_side = COALESCE(EXCLUDED.winning_side, public.match_rounds.winning_side),
        winner_side = COALESCE(EXCLUDED.winner_side, public.match_rounds.winner_side),
        win_reason = COALESCE(EXCLUDED.win_reason, public.match_rounds.win_reason),
        bomb_planted = COALESCE(EXCLUDED.bomb_planted, public.match_rounds.bomb_planted),
        bomb_defused = COALESCE(EXCLUDED.bomb_defused, public.match_rounds.bomb_defused),
        bomb_exploded = COALESCE(EXCLUDED.bomb_exploded, public.match_rounds.bomb_exploded),
        quality = EXCLUDED.quality,
        metadata = public.match_rounds.metadata || EXCLUDED.metadata
      RETURNING id INTO _round_id;
      _round_ids := _round_ids || jsonb_build_object(_row->>'roundNumber', _round_id::text);
      _rounds_written := _rounds_written + 1;
    END LOOP;

    FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'roundPlayers','[]'::jsonb)) LOOP
      INSERT INTO public.round_players (
        match_id, round_id, round_number, participant_key, internal_player_id, side,
        survived, money_start, money_end, equipment_value, buy_context, kills, deaths,
        assists, damage, flash_assists, opening_kill, opening_death, traded, trade_kill,
        metadata)
      VALUES (
        _match_id, NULLIF(_round_ids->>(_row->>'roundNumber'),'')::uuid,
        (_row->>'roundNumber')::integer, _row->>'participantKey',
        (SELECT internal_player_id FROM public.match_participants
          WHERE match_id = _match_id AND participant_key = _row->>'participantKey'),
        _row->>'side', (_row->>'survived')::boolean, (_row->>'moneyStart')::integer,
        (_row->>'moneyEnd')::integer, (_row->>'equipmentValue')::integer,
        _row->>'buyContext', (_row->>'kills')::integer, (_row->>'deaths')::integer,
        (_row->>'assists')::integer, (_row->>'damage')::numeric,
        (_row->>'flashAssists')::integer, (_row->>'openingKill')::boolean,
        (_row->>'openingDeath')::boolean, (_row->>'traded')::boolean,
        (_row->>'tradeKill')::boolean, COALESCE(_row->'metadata','{}'::jsonb))
      ON CONFLICT (match_id, round_number, participant_key) DO NOTHING;
      _round_players_written := _round_players_written + 1;
    END LOOP;

    FOR _row IN SELECT value FROM jsonb_array_elements(COALESCE(_bundle->'events','[]'::jsonb)) LOOP
      INSERT INTO public.round_events (
        match_id, match_source_id, round_id, round_number, event_type, tick, time_seconds,
        actor_steam_id, victim_steam_id, assister_steam_id, source_actor_external_id,
        source_victim_external_id, source_assister_external_id, weapon, headshot,
        distance, damage, quality, data)
      VALUES (
        _match_id, _source_id, NULLIF(_round_ids->>(_row->>'roundNumber'),'')::uuid,
        (_row->>'roundNumber')::integer, _row->>'type', (_row->>'tick')::integer,
        (_row->>'gameTimeSeconds')::numeric, _row->>'actorParticipantKey',
        _row->>'victimParticipantKey', _row->>'assisterParticipantKey',
        _row->>'sourceActorExternalId', _row->>'sourceVictimExternalId',
        _row->>'sourceAssisterExternalId', _row->>'weapon', (_row->>'headshot')::boolean,
        (_row->>'distance')::numeric, (_row->>'damage')::numeric,
        COALESCE(_row->'quality','{}'::jsonb), COALESCE(_row->'data','{}'::jsonb));
      _events_written := _events_written + 1;
    END LOOP;

    UPDATE public.matches SET round_source = _source WHERE id = _match_id;
  END IF;

  RETURN jsonb_build_object(
    'match_id', _match_id,
    'series_id', _series_id,
    'match_source_id', _source_id,
    'created', _created,
    'rounds_written', _rounds_written,
    'round_players_written', _round_players_written,
    'events_written', _events_written);
END;
$function$;