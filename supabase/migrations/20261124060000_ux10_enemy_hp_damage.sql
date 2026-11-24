-- UX-1.0 — `enemy-hp-v1`: the damage behind the ADR shown to players.
--
-- Production audit (2026-11-24): match_metrics.adr = Σ player_hurt.dmg_health ÷ rounds for
-- EVERY victim. In CS2 demos dmg_health is not capped at the victim's remaining health, and team
-- and self damage were counted, inflating ADR by up to ~40 % (de_mirage 123.5 vs 75.0). The game
-- scoreboard, FACEIT, Leetify, HLTV and awpy count enemy health removed, each hit capped.
--
-- Additive only:
--   * three nullable columns; `adr` keeps its historical meaning (pro-score-v1 and
--     dna-weighted-v2 are built on it and are not changed);
--   * persist_demo_projection is the production definition with the three columns added to the
--     INSERT and to the ON CONFLICT update — nothing else changes. Verified 2026-11-24:
--       md5(pg_get_functiondef) in production = 81fa7d85f106803edfa3bd7f71f0b26d (full CREATE text)
--       md5(prosrc) in production            = f9ebd3648fd5e87c2ca5e948a891e6a3 (body only)
--       md5(body) of 20260921073324_…sql      = f9ebd3648fd5e87c2ca5e948a891e6a3 (identical)
--     Signature, defaults, SECURITY DEFINER, search_path '' and language are unchanged; owner and
--     grants are re-stated below exactly as 20260921073324 set them.
-- Rollback: DROP the three columns and re-create the previous definition (migration
-- 20260921073324_eb26ca2b-d870-4053-9865-4cdb352b045c.sql). Historical rows are filled by
-- the reviewed TypeScript implementation (src/lib/metrics/enemyDamage.ts), not here.

ALTER TABLE public.match_metrics
  ADD COLUMN IF NOT EXISTS damage_enemy_hp integer,
  ADD COLUMN IF NOT EXISTS damage_enemy_hp_method text,
  ADD COLUMN IF NOT EXISTS damage_enemy_hp_excluded_hits integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_metrics_damage_enemy_hp_check'
  ) THEN
    ALTER TABLE public.match_metrics
      ADD CONSTRAINT match_metrics_damage_enemy_hp_check CHECK (
        (damage_enemy_hp IS NULL OR damage_enemy_hp >= 0)
        AND (damage_enemy_hp_excluded_hits IS NULL OR damage_enemy_hp_excluded_hits >= 0)
        AND (damage_enemy_hp_method IS NULL
             OR damage_enemy_hp_method IN ('HEALTH_AFTER', 'RECONSTRUCTED', 'MIXED'))
      );
  END IF;
END $$;

COMMENT ON COLUMN public.match_metrics.damage_enemy_hp IS
  'enemy-hp-v1: enemy health removed by the player (each hit capped at the victim''s remaining health; team, self, world and unknown-side hits excluded). ADR shown to players = damage_enemy_hp / rounds_played.';
COMMENT ON COLUMN public.match_metrics.damage_enemy_hp_method IS
  'enemy-hp-v1 health cap source: HEALTH_AFTER (game health after each hit), RECONSTRUCTED (100 per round minus prior hits) or MIXED.';
COMMENT ON COLUMN public.match_metrics.damage_enemy_hp_excluded_hits IS
  'enemy-hp-v1 coverage: player hits on non-teammates left out of damage_enemy_hp because the victim side was unknown or the health removed could not be determined. > 0 = PARTIAL.';
COMMENT ON COLUMN public.match_metrics.adr IS
  'Historical: every dmg_health the player dealt (uncapped, all victims) / rounds_played. Input of pro-score-v1 and dna-weighted-v2. Not the ADR shown to players (see damage_enemy_hp).';

CREATE OR REPLACE FUNCTION public.persist_demo_projection(_match_id uuid, _upload_id uuid, _player_id uuid, _steam_id text, _match_wide jsonb, _player_scoped jsonb, _metrics jsonb, _features jsonb, _job_id uuid DEFAULT NULL::uuid, _job_result jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    damage_enemy_hp, damage_enemy_hp_method, damage_enemy_hp_excluded_hits,
    kast, damage_taken, damage_efficiency, first_kills, first_deaths,
    opening_attempts, opening_success, opening_success_rate, trade_kills,
    trade_deaths, clutch_attempts, clutch_wins, clutches, multi_kills,
    utility_damage, grenade_damage, flash_assists, ct_rating, t_rating, rating
  ) VALUES (
    _match_id, _player_id, (_metrics->>'rounds_played')::int,
    (_metrics->>'kills')::int, (_metrics->>'deaths')::int, (_metrics->>'assists')::int,
    (_metrics->>'hs_percent')::numeric, (_metrics->>'adr')::numeric,
    (_metrics->>'damage_enemy_hp')::int, NULLIF(_metrics->>'damage_enemy_hp_method', ''),
    (_metrics->>'damage_enemy_hp_excluded_hits')::int,
    (_metrics->>'kast')::numeric,
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
    damage_enemy_hp = EXCLUDED.damage_enemy_hp,
    damage_enemy_hp_method = EXCLUDED.damage_enemy_hp_method,
    damage_enemy_hp_excluded_hits = EXCLUDED.damage_enemy_hp_excluded_hits,
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
$function$;

REVOKE ALL ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) TO service_role;
